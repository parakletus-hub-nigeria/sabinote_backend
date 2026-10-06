import { CurriculumStage } from '@prisma/client';
import {
  detectCurriculumStage,
  getStagePedagogy,
  calculatePacing,
  buildGroundedPlanPrompt,
  buildGroundedNotePrompt,
  calculateGroundingFidelity,
} from './stage-grounding.prompt';
import { NormalizedCurriculum } from '../../curriculum/curriculum.service';

describe('StageGroundingPromptEngine', () => {
  describe('detectCurriculumStage', () => {
    it('should correctly detect early years stages', () => {
      expect(detectCurriculumStage('Pre-Nursery')).toBe(CurriculumStage.early_years);
      expect(detectCurriculumStage('Nursery 1')).toBe(CurriculumStage.early_years);
      expect(detectCurriculumStage('Kindergarten')).toBe(CurriculumStage.early_years);
      expect(detectCurriculumStage('KG 2')).toBe(CurriculumStage.early_years);
      expect(detectCurriculumStage('Creche')).toBe(CurriculumStage.early_years);
    });

    it('should correctly detect primary school stages', () => {
      expect(detectCurriculumStage('Primary 1')).toBe(CurriculumStage.primary);
      expect(detectCurriculumStage('Primary 4')).toBe(CurriculumStage.primary);
      expect(detectCurriculumStage('Basic 3')).toBe(CurriculumStage.primary);
      expect(detectCurriculumStage('Basic 6')).toBe(CurriculumStage.primary);
      expect(detectCurriculumStage('Pry 2')).toBe(CurriculumStage.primary);
    });

    it('should correctly detect junior secondary school stages', () => {
      expect(detectCurriculumStage('JSS 1')).toBe(CurriculumStage.junior_secondary);
      expect(detectCurriculumStage('JSS 3')).toBe(CurriculumStage.junior_secondary);
      expect(detectCurriculumStage('Basic 7')).toBe(CurriculumStage.junior_secondary);
      expect(detectCurriculumStage('Basic 9')).toBe(CurriculumStage.junior_secondary);
    });

    it('should correctly detect senior secondary school stages', () => {
      expect(detectCurriculumStage('SSS 1')).toBe(CurriculumStage.senior_secondary);
      expect(detectCurriculumStage('SSS 3')).toBe(CurriculumStage.senior_secondary);
      expect(detectCurriculumStage('SS 2')).toBe(CurriculumStage.senior_secondary);
      expect(detectCurriculumStage('Senior Secondary 1')).toBe(CurriculumStage.senior_secondary);
    });
  });

  describe('calculatePacing', () => {
    it('should calculate proportional steps for standard 40-minute periods', () => {
      const pacing = calculatePacing(40);
      expect(pacing.step1Minutes).toBe(5);
      expect(pacing.step3Minutes).toBe(10);
      expect(pacing.step2Minutes).toBe(25);
      expect(pacing.step1Minutes + pacing.step2Minutes + pacing.step3Minutes).toBe(40);
    });

    it('should calculate proportional steps for 80-minute double periods', () => {
      const pacing = calculatePacing(80);
      expect(pacing.step1Minutes).toBe(10);
      expect(pacing.step3Minutes).toBe(20);
      expect(pacing.step2Minutes).toBe(50);
      expect(pacing.step1Minutes + pacing.step2Minutes + pacing.step3Minutes).toBe(80);
    });
  });

  describe('getStagePedagogy', () => {
    it('should provide play-based pedagogy for early years', () => {
      const pedagogy = getStagePedagogy(CurriculumStage.early_years);
      expect(pedagogy.cognitiveVerbs).toContain('point to');
      expect(pedagogy.materialsGuidance).toContain('Real everyday objects');
      expect(pedagogy.step1Title).toContain('Warm-Up & Circle Time');
    });

    it('should provide examination and lab pedagogy for senior secondary', () => {
      const pedagogy = getStagePedagogy(CurriculumStage.senior_secondary);
      expect(pedagogy.cognitiveVerbs).toContain('derive');
      expect(pedagogy.materialsGuidance).toContain('laboratory');
      expect(pedagogy.evaluationGuidance).toContain('WAEC');
    });
  });

  describe('calculateGroundingFidelity', () => {
    it('should report high fidelity when canonical objectives are present', () => {
      const canonical = [
        'Identify parts of a flower',
        'State functions of petals and sepals',
        'Draw a labeled longitudinal section of a flower',
      ];
      const plan = [
        'By the end of this lesson, students will be able to identify parts of a flower',
        'By the end of this lesson, students will be able to state the functions of petals',
        'By the end of this lesson, students will be able to draw and label a section of a flower',
      ];

      const res = calculateGroundingFidelity(canonical, plan);
      expect(res.score).toBeGreaterThanOrEqual(90);
    });

    it('should report lower fidelity when objectives diverge', () => {
      const canonical = [
        'Identify types of chemical bonding',
        'Differentiate ionic and covalent bonds',
      ];
      const plan = [
        'Students will discuss Nigerian democracy',
      ];

      const res = calculateGroundingFidelity(canonical, plan);
      expect(res.score).toBe(0);
    });
  });

  describe('buildGroundedPlanPrompt', () => {
    it('should inject canonical 2025 scheme fields into prompt', () => {
      const curriculum: NormalizedCurriculum = {
        source: 'release',
        id: 'unit-123',
        releaseId: 'rel-2025-1',
        unitId: 'unit-123',
        state: 'Lagos',
        subject: 'Basic Science',
        classLevel: 'Primary 5',
        term: 2,
        week: 3,
        topic: 'Changes in Living Things',
        subTopics: ['Growth changes', 'Development changes'],
        objectives: ['Observe growth changes in seedlings', 'Measure plant height'],
        teachingActivities: 'Teacher brings potted seedlings to class',
        teachingAids: 'Bean seedlings in plastic cups, rulers',
        evaluation: 'Ask pupils to measure and record height',
      };

      const result = buildGroundedPlanPrompt(curriculum, 40, 'standard', '2026/2027');
      expect(result.stage).toBe(CurriculumStage.primary);
      expect(result.prompt).toContain('Changes in Living Things');
      expect(result.prompt).toContain('Bean seedlings in plastic cups, rulers');
      expect(result.prompt).toContain('Teacher brings potted seedlings to class');
      expect(result.systemPrompt).toContain('Primary Education specialist');
    });

    it('should inject teacher-selected learning aids and pedagogical emphasis when provided', () => {
      const curriculum: NormalizedCurriculum = {
        source: 'release',
        id: 'unit-456',
        state: 'Federal',
        subject: 'Mathematics',
        classLevel: 'SSS 2',
        term: 1,
        week: 4,
        topic: 'Quadratic Equations',
        subTopics: ['Factorization method', 'Completing the square'],
        objectives: ['Solve quadratic equations by factorization'],
      };

      const result = buildGroundedPlanPrompt(curriculum, 40, 'standard', '2026/2027', {
        learningAids: ['Graph board', 'Quadratic flashcards'],
        pedagogicalEmphasis: 'exam_focus',
      });

      expect(result.stage).toBe(CurriculumStage.senior_secondary);
      expect(result.prompt).toContain('Teacher Selected Aids    : Graph board, Quadratic flashcards');
      expect(result.prompt).toContain('Instructional Materials Priority: The teacher specifically selected: [Graph board, Quadratic flashcards]');
      expect(result.prompt).toContain('National Examination Focus (WAEC / BECE / NECO)');
    });
  });
});
