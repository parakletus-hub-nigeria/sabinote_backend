import { CurriculumStage } from '@prisma/client';
import {
  BENCHMARK_50_CASES,
  buildCompliantLessonPlan,
  validateInspectionCompliance,
} from './inspection-compliance.harness';

describe('Inspection-Compliance Validation & Test Harness (Phase 4)', () => {
  describe('Benchmark Coverage & Stage Distribution', () => {
    it('should contain exactly 50 canonical benchmark test cases', () => {
      expect(BENCHMARK_50_CASES).toHaveLength(50);
    });

    it('should cover all 4 Nigerian educational tiers with verified distributions', () => {
      const earlyYears = BENCHMARK_50_CASES.filter((b) => b.stage === CurriculumStage.early_years);
      const primary = BENCHMARK_50_CASES.filter((b) => b.stage === CurriculumStage.primary);
      const juniorSecondary = BENCHMARK_50_CASES.filter((b) => b.stage === CurriculumStage.junior_secondary);
      const seniorSecondary = BENCHMARK_50_CASES.filter((b) => b.stage === CurriculumStage.senior_secondary);

      expect(earlyYears).toHaveLength(10);
      expect(primary).toHaveLength(15);
      expect(juniorSecondary).toHaveLength(12);
      expect(seniorSecondary).toHaveLength(13);
    });

    it('should assign valid curriculum releases and canonical unit IDs to all benchmarks', () => {
      for (const bench of BENCHMARK_50_CASES) {
        expect(bench.curriculumReleaseId).toMatch(/^NERDC-(ECE|PRI|JSS|SSS)-\d{4}\.\d+$/);
        expect(bench.curriculumUnitId).toBeTruthy();
        expect(bench.canonicalObjectives.length).toBeGreaterThanOrEqual(3);
      }
    });
  });

  describe('Full 50-Benchmark Compliance Execution', () => {
    it.each(BENCHMARK_50_CASES.map((b) => [b.id, b.subject, b.classLevel, b]))(
      'Benchmark [%s] %s (%s) must pass 100% inspection compliance',
      (_id, _subject, _classLevel, bench) => {
        const plan = buildCompliantLessonPlan(bench as any);
        const report = validateInspectionCompliance(plan);

        if (!report.passed) {
          // Provide rich failure diagnostics
          console.error(`Benchmark ${_id} failed:`, report.violations);
        }

        expect(report.passed).toBe(true);
        expect(report.score).toBe(100);
        expect(report.violations).toHaveLength(0);
        expect(report.metrics.bloomObjectivesCount).toBeGreaterThanOrEqual(3);
        expect(report.metrics.presentationStepsCount).toBeGreaterThanOrEqual(3);
        expect(report.metrics.evaluationQuestionsCount).toBeGreaterThanOrEqual(3);
        expect(report.metrics.hasValidProvenance).toBe(true);
      },
    );
  });

  describe('Rule 1 Linter: Measurable Bloom\'s Objectives', () => {
    it('should flag lesson plans with fewer than 3 behavioral objectives', () => {
      const bench = BENCHMARK_50_CASES[0];
      const plan = buildCompliantLessonPlan(bench);
      plan.objectives.cognitive = ['identify sound /s/'];
      plan.objectives.affective = [];
      plan.objectives.psychomotor = [];

      const report = validateInspectionCompliance(plan);
      expect(report.passed).toBe(false);
      expect(report.violations.some((v) => v.rule === 'BLOOM_OBJECTIVES')).toBe(true);
      expect(report.violations[0].message).toContain('at least 3 measurable');
    });

    it('should flag unmeasurable verbs such as "know" or "understand"', () => {
      const bench = BENCHMARK_50_CASES[15]; // Primary
      const plan = buildCompliantLessonPlan(bench);
      plan.objectives.cognitive = [
        'know the meaning of social studies',
        'understand why family is important',
      ];

      const report = validateInspectionCompliance(plan);
      expect(report.passed).toBe(false);
      expect(report.violations.some((v) => v.rule === 'BLOOM_OBJECTIVES' && v.message.includes('Unmeasurable verb'))).toBe(true);
    });
  });

  describe('Rule 2 Linter: Distinct Teacher & Pupil Activities', () => {
    it('should flag lesson plans with fewer than 3 presentation steps', () => {
      const bench = BENCHMARK_50_CASES[25]; // JSS
      const plan = buildCompliantLessonPlan(bench);
      plan.presentation = plan.presentation.slice(0, 2);

      const report = validateInspectionCompliance(plan);
      expect(report.passed).toBe(false);
      expect(report.violations.some((v) => v.rule === 'TEACHER_PUPIL_ACTIVITIES')).toBe(true);
    });

    it('should flag presentation steps with duplicate teacher and student activities', () => {
      const bench = BENCHMARK_50_CASES[30];
      const plan = buildCompliantLessonPlan(bench);
      plan.presentation[0].studentActivity = plan.presentation[0].teacherActivity;

      const report = validateInspectionCompliance(plan);
      expect(report.passed).toBe(false);
      expect(report.violations.some((v) => v.rule === 'TEACHER_PUPIL_ACTIVITIES' && v.message.includes('duplicate'))).toBe(true);
    });

    it('should flag presentation steps with empty teacher activity', () => {
      const bench = BENCHMARK_50_CASES[35]; // SSS
      const plan = buildCompliantLessonPlan(bench);
      plan.presentation[1].teacherActivity = '';

      const report = validateInspectionCompliance(plan);
      expect(report.passed).toBe(false);
      expect(report.violations.some((v) => v.rule === 'TEACHER_PUPIL_ACTIVITIES')).toBe(true);
    });
  });

  describe('Rule 3 Linter: Diagnostic Evaluation Questions', () => {
    it('should flag plans with fewer than 3 diagnostic questions', () => {
      const bench = BENCHMARK_50_CASES[40]; // SSS Chemistry
      const plan = buildCompliantLessonPlan(bench);
      plan.evaluation = ['1. Define equilibrium.'];

      const report = validateInspectionCompliance(plan);
      expect(report.passed).toBe(false);
      expect(report.violations.some((v) => v.rule === 'DIAGNOSTIC_EVALUATION')).toBe(true);
    });
  });

  describe('Rule 4 Linter: Canonical Curriculum Provenance', () => {
    it('should flag plans lacking curriculumReleaseId or curriculumUnitId', () => {
      const bench = BENCHMARK_50_CASES[49]; // SSS Organic Chemistry
      const plan = buildCompliantLessonPlan(bench);
      (plan as any).curriculumReleaseId = '';
      (plan as any).curriculumUnitId = '';

      const report = validateInspectionCompliance(plan);
      expect(report.passed).toBe(false);
      expect(report.violations.some((v) => v.rule === 'CURRICULUM_PROVENANCE')).toBe(true);
    });
  });
});
