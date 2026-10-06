import { CurriculumStage } from '@prisma/client';
import { LessonPlan } from '../schemas/lesson-plan.schema';

export interface BenchmarkCase {
  id: string;
  stage: CurriculumStage;
  classLevel: string;
  subject: string;
  term: number;
  week: number;
  topic: string;
  curriculumReleaseId: string;
  curriculumUnitId: string;
  canonicalObjectives: string[];
}

export interface ComplianceViolation {
  rule: 'BLOOM_OBJECTIVES' | 'TEACHER_PUPIL_ACTIVITIES' | 'DIAGNOSTIC_EVALUATION' | 'CURRICULUM_PROVENANCE';
  message: string;
  details?: any;
}

export interface InspectionComplianceReport {
  passed: boolean;
  score: number;
  violations: ComplianceViolation[];
  metrics: {
    bloomObjectivesCount: number;
    validVerbsCount: number;
    presentationStepsCount: number;
    evaluationQuestionsCount: number;
    hasValidProvenance: boolean;
  };
}

const MEASURABLE_BLOOM_VERBS = new Set([
  'identify', 'state', 'define', 'list', 'mention', 'name', 'recite', 'pronounce',
  'trace', 'count', 'match', 'sort', 'explain', 'describe', 'discuss', 'outline',
  'classify', 'distinguish', 'differentiate', 'compare', 'contrast', 'calculate',
  'solve', 'compute', 'determine', 'apply', 'demonstrate', 'illustrate', 'perform',
  'construct', 'draw', 'model', 'analyse', 'analyze', 'evaluate', 'justify', 'assess',
  'formulate', 'summarize', 'show', 'write', 'read', 'sing', 'mould', 'clap', 'color'
]);

const UNMEASURABLE_VERBS = new Set([
  'know', 'understand', 'comprehend', 'learn', 'familiarize', 'appreciate', 'be aware', 'study'
]);

/**
 * Validates a lesson plan against official Nigerian Ministry of Education inspection guidelines.
 */
export function validateInspectionCompliance(
  plan: any,
  provenance?: { curriculumReleaseId?: string; curriculumUnitId?: string }
): InspectionComplianceReport {
  const violations: ComplianceViolation[] = [];

  const releaseId = provenance?.curriculumReleaseId || plan?.curriculumReleaseId || plan?.metadata?.curriculumReleaseId;
  const unitId = provenance?.curriculumUnitId || plan?.curriculumUnitId || plan?.metadata?.curriculumUnitId;

  // ─── Rule 1: Bloom's Behavioral Objectives ──────────────────────────────────
  const cognitive = Array.isArray(plan?.objectives?.cognitive) ? plan.objectives.cognitive : [];
  const affective = Array.isArray(plan?.objectives?.affective) ? plan.objectives.affective : [];
  const psychomotor = Array.isArray(plan?.objectives?.psychomotor) ? plan.objectives.psychomotor : [];
  const allObjectives = [...cognitive, ...affective, ...psychomotor];

  let validVerbsCount = 0;
  if (allObjectives.length < 3) {
    violations.push({
      rule: 'BLOOM_OBJECTIVES',
      message: `Inspection requires at least 3 measurable behavioural objectives. Found ${allObjectives.length}.`,
      details: { found: allObjectives.length, expectedMin: 3 },
    });
  }

  for (const obj of allObjectives) {
    const text = String(obj).trim().toLowerCase();
    const firstWord = text.replace(/^(by the end of the lesson, pupils? should be able to|students? will be able to)\s*/i, '')
      .trim()
      .split(/\s+/)[0]?.replace(/[^a-z]/g, '');

    if (firstWord && UNMEASURABLE_VERBS.has(firstWord)) {
      violations.push({
        rule: 'BLOOM_OBJECTIVES',
        message: `Unmeasurable verb "${firstWord}" detected in objective: "${obj}". Use observable action verbs.`,
        details: { verb: firstWord, objective: obj },
      });
    } else if (firstWord && (MEASURABLE_BLOOM_VERBS.has(firstWord) || firstWord.length >= 3)) {
      validVerbsCount++;
    }
  }

  // ─── Rule 2: Distinct Teacher and Pupil Activities ──────────────────────────
  const presentationSteps = Array.isArray(plan?.presentation) ? plan.presentation : [];
  if (presentationSteps.length < 3) {
    violations.push({
      rule: 'TEACHER_PUPIL_ACTIVITIES',
      message: `Inspection requires at least 3 distinct NERDC presentation steps. Found ${presentationSteps.length}.`,
      details: { found: presentationSteps.length, expectedMin: 3 },
    });
  }

  presentationSteps.forEach((step: any, index: number) => {
    const teacher = (step?.teacherActivity ?? '').trim();
    const student = (step?.studentActivity ?? step?.pupilActivity ?? '').trim();

    if (!teacher || teacher.length < 10) {
      violations.push({
        rule: 'TEACHER_PUPIL_ACTIVITIES',
        message: `Step ${index + 1} lacks detailed teacher activity.`,
        details: { step: index + 1 },
      });
    }

    if (!student || student.length < 10) {
      violations.push({
        rule: 'TEACHER_PUPIL_ACTIVITIES',
        message: `Step ${index + 1} lacks detailed pupil/student activity.`,
        details: { step: index + 1 },
      });
    }

    if (teacher && student && teacher.toLowerCase() === student.toLowerCase()) {
      violations.push({
        rule: 'TEACHER_PUPIL_ACTIVITIES',
        message: `Step ${index + 1} has duplicate teacher and student activities. Roles must be distinct.`,
        details: { step: index + 1 },
      });
    }
  });

  // ─── Rule 3: Diagnostic Evaluation Questions ────────────────────────────────
  const rawEvaluation = Array.isArray(plan?.evaluation) ? plan.evaluation : [];
  if (rawEvaluation.length < 3) {
    violations.push({
      rule: 'DIAGNOSTIC_EVALUATION',
      message: `Inspection requires at least 3 diagnostic evaluation questions matching objectives. Found ${rawEvaluation.length}.`,
      details: { found: rawEvaluation.length, expectedMin: 3 },
    });
  }

  // ─── Rule 4: Canonical Curriculum Provenance ─────────────────────────────────
  const hasValidProvenance = Boolean(releaseId && String(releaseId).trim().length > 0 && unitId && String(unitId).trim().length > 0);
  if (!hasValidProvenance) {
    violations.push({
      rule: 'CURRICULUM_PROVENANCE',
      message: 'Plan lacks verified curriculum provenance. Must reference curriculumReleaseId and curriculumUnitId.',
      details: { releaseId, unitId },
    });
  }

  const passed = violations.length === 0;
  const score = Math.max(0, 100 - violations.length * 25);

  return {
    passed,
    score,
    violations,
    metrics: {
      bloomObjectivesCount: allObjectives.length,
      validVerbsCount,
      presentationStepsCount: presentationSteps.length,
      evaluationQuestionsCount: rawEvaluation.length,
      hasValidProvenance,
    },
  };
}

/**
 * 50 diverse canonical benchmark units across all Nigerian educational stages.
 */
export const BENCHMARK_50_CASES: BenchmarkCase[] = [
  // ─── ECCDE / Early Years (10 benchmarks) ──────────────────────────────────
  {
    id: 'BENCH-EY-01', stage: CurriculumStage.early_years, classLevel: 'Nursery 1', subject: 'Phonics', term: 1, week: 2,
    topic: 'Sound /s/ and /a/ Identification', curriculumReleaseId: 'NERDC-ECE-2025.1', curriculumUnitId: 'UNIT-ECE-PHONICS-001',
    canonicalObjectives: ['identify the /s/ sound with auditory cues', 'trace letter s in sand tray', 'sing the snake rhyme with peers']
  },
  {
    id: 'BENCH-EY-02', stage: CurriculumStage.early_years, classLevel: 'Nursery 1', subject: 'Numeracy', term: 1, week: 3,
    topic: 'Concrete Counting 1 to 5', curriculumReleaseId: 'NERDC-ECE-2025.1', curriculumUnitId: 'UNIT-ECE-NUM-002',
    canonicalObjectives: ['count 1 to 5 bottle caps accurately', 'match number symbol 3 to 3 objects', 'clap hands 5 times in rhythm']
  },
  {
    id: 'BENCH-EY-03', stage: CurriculumStage.early_years, classLevel: 'Nursery 2', subject: 'Rhymes and Songs', term: 2, week: 1,
    topic: 'Action Rhyme - Baa Baa Black Sheep', curriculumReleaseId: 'NERDC-ECE-2025.1', curriculumUnitId: 'UNIT-ECE-RHYME-003',
    canonicalObjectives: ['recite the rhyme with expressive gestures', 'take turns singing solo lines', 'imitate the sheep sound joyfully']
  },
  {
    id: 'BENCH-EY-04', stage: CurriculumStage.early_years, classLevel: 'Kindergarten', subject: 'Social Habits', term: 1, week: 4,
    topic: 'Courteous Greetings (Good Morning & Thank You)', curriculumReleaseId: 'NERDC-ECE-2025.1', curriculumUnitId: 'UNIT-ECE-SOC-004',
    canonicalObjectives: ['demonstrate respectful morning greeting posture', 'say thank you when receiving materials', 'cooperate in circle time greetings']
  },
  {
    id: 'BENCH-EY-05', stage: CurriculumStage.early_years, classLevel: 'Kindergarten', subject: 'Health Habits', term: 2, week: 3,
    topic: 'Washing Hands with Soap and Clean Water', curriculumReleaseId: 'NERDC-ECE-2025.1', curriculumUnitId: 'UNIT-ECE-HLTH-005',
    canonicalObjectives: ['state when handwashing is necessary', 'perform the 6 handwashing steps using water', 'handle hand towels cleanly']
  },
  {
    id: 'BENCH-EY-06', stage: CurriculumStage.early_years, classLevel: 'Pre-Nursery', subject: 'Sensory Exploration', term: 1, week: 1,
    topic: 'Primary Colors (Red and Yellow)', curriculumReleaseId: 'NERDC-ECE-2025.1', curriculumUnitId: 'UNIT-ECE-SENS-006',
    canonicalObjectives: ['point to red balls upon verbal prompt', 'sort yellow beads into matching cups', 'show excitement exploring colors']
  },
  {
    id: 'BENCH-EY-07', stage: CurriculumStage.early_years, classLevel: 'Nursery 2', subject: 'Fine Motor Skills', term: 2, week: 5,
    topic: 'Playdough Modeling of Simple Shapes', curriculumReleaseId: 'NERDC-ECE-2025.1', curriculumUnitId: 'UNIT-ECE-MTR-007',
    canonicalObjectives: ['mould a round ball using palm movements', 'press out flat pancake shapes with fingers', 'share playdough tools peacefully']
  },
  {
    id: 'BENCH-EY-08', stage: CurriculumStage.early_years, classLevel: 'Kindergarten', subject: 'Science Exploration', term: 3, week: 2,
    topic: 'Sink and Float Water Experiment', curriculumReleaseId: 'NERDC-ECE-2025.1', curriculumUnitId: 'UNIT-ECE-SCI-008',
    canonicalObjectives: ['predict whether stones or leaves float in water', 'place items gently into water basins', 'observe and describe floating items']
  },
  {
    id: 'BENCH-EY-09', stage: CurriculumStage.early_years, classLevel: 'Nursery 1', subject: 'Storytelling', term: 2, week: 4,
    topic: 'The Tortoise and the Hare Story Recap', curriculumReleaseId: 'NERDC-ECE-2025.1', curriculumUnitId: 'UNIT-ECE-STRY-009',
    canonicalObjectives: ['name the two animals in the picture book', 'imitate the slow walking pace of the tortoise', 'listen attentively to story events']
  },
  {
    id: 'BENCH-EY-10', stage: CurriculumStage.early_years, classLevel: 'Kindergarten', subject: 'Numeracy', term: 3, week: 4,
    topic: 'Sorting Objects by Size (Big and Small)', curriculumReleaseId: 'NERDC-ECE-2025.1', curriculumUnitId: 'UNIT-ECE-NUM-010',
    canonicalObjectives: ['identify big and small shoes correctly', 'sort classroom blocks into two distinct baskets', 'participate actively in sorting games']
  },

  // ─── Primary (15 benchmarks) ─────────────────────────────────────────────
  {
    id: 'BENCH-PR-01', stage: CurriculumStage.primary, classLevel: 'Primary 1', subject: 'Basic Science', term: 1, week: 2,
    topic: 'Living and Non-Living Things in School Surroundings', curriculumReleaseId: 'NERDC-PRI-2024.1', curriculumUnitId: 'UNIT-PRI-SCI-001',
    canonicalObjectives: ['list 3 living things found on school grounds', 'mention 3 non-living items in the classroom', 'classify pictures into living and non-living']
  },
  {
    id: 'BENCH-PR-02', stage: CurriculumStage.primary, classLevel: 'Primary 1', subject: 'English Language', term: 1, week: 3,
    topic: 'Simple Nouns: Naming Words for People and Places', curriculumReleaseId: 'NERDC-PRI-2024.1', curriculumUnitId: 'UNIT-PRI-ENG-002',
    canonicalObjectives: ['define a noun as a naming word', 'list 4 names of persons in their school', 'construct 2 oral sentences containing nouns']
  },
  {
    id: 'BENCH-PR-03', stage: CurriculumStage.primary, classLevel: 'Primary 2', subject: 'Mathematics', term: 2, week: 2,
    topic: 'Addition of 2-Digit Numbers without Regrouping', curriculumReleaseId: 'NERDC-PRI-2024.1', curriculumUnitId: 'UNIT-PRI-MTH-003',
    canonicalObjectives: ['state place value for tens and units', 'calculate sums of 2-digit numbers accurately', 'demonstrate working with bundle sticks']
  },
  {
    id: 'BENCH-PR-04', stage: CurriculumStage.primary, classLevel: 'Primary 2', subject: 'Social Studies', term: 1, week: 4,
    topic: 'Roles and Responsibilities of Family Members', curriculumReleaseId: 'NERDC-PRI-2024.1', curriculumUnitId: 'UNIT-PRI-SOC-004',
    canonicalObjectives: ['state the primary duty of parents at home', 'outline 2 duties of children to their family', 'show appreciation for family care']
  },
  {
    id: 'BENCH-PR-05', stage: CurriculumStage.primary, classLevel: 'Primary 3', subject: 'Basic Science', term: 2, week: 3,
    topic: 'Measurement of Length Using Metric Units (cm and m)', curriculumReleaseId: 'NERDC-PRI-2024.1', curriculumUnitId: 'UNIT-PRI-SCI-005',
    canonicalObjectives: ['state the standard unit of length', 'measure desk dimensions with a 30cm ruler', 'record measurements neatly in exercise books']
  },
  {
    id: 'BENCH-PR-06', stage: CurriculumStage.primary, classLevel: 'Primary 3', subject: 'English Language', term: 1, week: 5,
    topic: 'Regular Action Verbs in the Simple Present Tense', curriculumReleaseId: 'NERDC-PRI-2024.1', curriculumUnitId: 'UNIT-PRI-ENG-006',
    canonicalObjectives: ['define an action verb with examples', 'identify verbs in given textbook passages', 'write 3 complete sentences using active verbs']
  },
  {
    id: 'BENCH-PR-07', stage: CurriculumStage.primary, classLevel: 'Primary 4', subject: 'Mathematics', term: 1, week: 3,
    topic: 'Prime Numbers and Multiples up to 50', curriculumReleaseId: 'NERDC-PRI-2024.1', curriculumUnitId: 'UNIT-PRI-MTH-007',
    canonicalObjectives: ['define a prime number clearly', 'list all prime numbers between 1 and 20', 'differentiate between prime numbers and composite numbers']
  },
  {
    id: 'BENCH-PR-08', stage: CurriculumStage.primary, classLevel: 'Primary 4', subject: 'Civic Education', term: 2, week: 2,
    topic: 'National Symbols: The Nigerian Flag and Coat of Arms', curriculumReleaseId: 'NERDC-PRI-2024.1', curriculumUnitId: 'UNIT-PRI-CIV-008',
    canonicalObjectives: ['explain the color symbolism of the Nigerian flag', 'identify 3 distinct features on the Coat of Arms', 'demonstrate respect when reciting the national pledge']
  },
  {
    id: 'BENCH-PR-09', stage: CurriculumStage.primary, classLevel: 'Primary 5', subject: 'Basic Technology', term: 1, week: 4,
    topic: 'Care and Safe Maintenance of Hand Tools', curriculumReleaseId: 'NERDC-PRI-2024.1', curriculumUnitId: 'UNIT-PRI-TEC-009',
    canonicalObjectives: ['identify hammer, screwdriver, and saw safely', 'state 2 safety rules when holding cutting tools', 'demonstrate oiling metal parts against rust']
  },
  {
    id: 'BENCH-PR-10', stage: CurriculumStage.primary, classLevel: 'Primary 5', subject: 'English Language', term: 2, week: 1,
    topic: 'Formal Letter Writing: Excuse Letter to Class Teacher', curriculumReleaseId: 'NERDC-PRI-2024.1', curriculumUnitId: 'UNIT-PRI-ENG-010',
    canonicalObjectives: ['outline the 6 structural parts of a formal letter', 'write the formal sender and recipient addresses', 'draft a coherent excuse letter for illness']
  },
  {
    id: 'BENCH-PR-11', stage: CurriculumStage.primary, classLevel: 'Primary 5', subject: 'Cultural & Creative Arts', term: 3, week: 2,
    topic: 'Traditional Calabash Carving and Pottery Styles', curriculumReleaseId: 'NERDC-PRI-2024.1', curriculumUnitId: 'UNIT-PRI-CCA-011',
    canonicalObjectives: ['name 2 Nigerian states renowned for pottery', 'describe how local clay is conditioned', 'draw a decorative traditional pattern']
  },
  {
    id: 'BENCH-PR-12', stage: CurriculumStage.primary, classLevel: 'Primary 6', subject: 'Basic Science', term: 1, week: 2,
    topic: 'The Solar System and the Nine Planets', curriculumReleaseId: 'NERDC-PRI-2024.1', curriculumUnitId: 'UNIT-PRI-SCI-012',
    canonicalObjectives: ['list the planets in order from the Sun', 'describe Earth\'s unique life-supporting features', 'draw and label a neat diagram of planetary orbits']
  },
  {
    id: 'BENCH-PR-13', stage: CurriculumStage.primary, classLevel: 'Primary 6', subject: 'Mathematics', term: 2, week: 4,
    topic: 'Simple Interest: Calculating Principal, Rate, and Time', curriculumReleaseId: 'NERDC-PRI-2024.1', curriculumUnitId: 'UNIT-PRI-MTH-013',
    canonicalObjectives: ['state the formula for simple interest I = (PRT)/100', 'calculate interest accrued on loans over 2 years', 'solve word problems involving savings interest']
  },
  {
    id: 'BENCH-PR-14', stage: CurriculumStage.primary, classLevel: 'Primary 6', subject: 'Physical and Health Education', term: 1, week: 5,
    topic: 'Relay Races and Baton Exchange Techniques', curriculumReleaseId: 'NERDC-PRI-2024.1', curriculumUnitId: 'UNIT-PRI-PHE-014',
    canonicalObjectives: ['explain visual and non-visual baton pass techniques', 'demonstrate the downward baton exchange in pairs', 'cooperate harmoniously in a 4x100m relay sprint team']
  },
  {
    id: 'BENCH-PR-15', stage: CurriculumStage.primary, classLevel: 'Primary 6', subject: 'Social Studies', term: 3, week: 3,
    topic: 'Telecommunications in Nigeria: GSM and Internet Growth', curriculumReleaseId: 'NERDC-PRI-2024.1', curriculumUnitId: 'UNIT-PRI-SOC-015',
    canonicalObjectives: ['explain the term telecommunication with local examples', 'state 3 economic benefits of mobile phones to traders', 'discuss 2 online security dangers for pupils']
  },

  // ─── Junior Secondary / JSS (12 benchmarks) ──────────────────────────────
  {
    id: 'BENCH-JS-01', stage: CurriculumStage.junior_secondary, classLevel: 'JSS 1', subject: 'Social Studies', term: 1, week: 2,
    topic: 'Meaning and Scope of Social Studies', curriculumReleaseId: 'NERDC-JSS-2024.1', curriculumUnitId: 'UNIT-JSS-SOC-001',
    canonicalObjectives: ['define social studies as the study of man and environment', 'outline 3 primary objectives of social studies education', 'explain the physical and social components of environment']
  },
  {
    id: 'BENCH-JS-02', stage: CurriculumStage.junior_secondary, classLevel: 'JSS 1', subject: 'Business Studies', term: 1, week: 3,
    topic: 'The Office: Definition and Departments', curriculumReleaseId: 'NERDC-JSS-2024.1', curriculumUnitId: 'UNIT-JSS-BUS-002',
    canonicalObjectives: ['define an office and its clerical functions', 'differentiate between open and closed office plans', 'list 4 departments in a standard commercial firm']
  },
  {
    id: 'BENCH-JS-03', stage: CurriculumStage.junior_secondary, classLevel: 'JSS 1', subject: 'Basic Technology', term: 2, week: 2,
    topic: 'Woodwork Hand Tools: Classification and Maintenance', curriculumReleaseId: 'NERDC-JSS-2024.1', curriculumUnitId: 'UNIT-JSS-TEC-003',
    canonicalObjectives: ['classify tools into cutting, boring, and marking groups', 'draw a try square and marking gauge with labels', 'demonstrate correct holding posture for handsaws']
  },
  {
    id: 'BENCH-JS-04', stage: CurriculumStage.junior_secondary, classLevel: 'JSS 1', subject: 'Mathematics', term: 1, week: 4,
    topic: 'Algebraic Simplification and Collecting Like Terms', curriculumReleaseId: 'NERDC-JSS-2024.1', curriculumUnitId: 'UNIT-JSS-MTH-004',
    canonicalObjectives: ['identify variables, coefficients, and constants', 'simplify algebraic expressions by grouping like terms', 'solve linear word problems in single variables']
  },
  {
    id: 'BENCH-JS-05', stage: CurriculumStage.junior_secondary, classLevel: 'JSS 2', subject: 'Basic Science', term: 1, week: 3,
    topic: 'Work, Energy, and Power Calculations', curriculumReleaseId: 'NERDC-JSS-2024.1', curriculumUnitId: 'UNIT-JSS-SCI-005',
    canonicalObjectives: ['state the scientific definitions of work and power', 'calculate work done using W = F x d with SI units', 'differentiate between kinetic and potential energy']
  },
  {
    id: 'BENCH-JS-06', stage: CurriculumStage.junior_secondary, classLevel: 'JSS 2', subject: 'Agricultural Science', term: 2, week: 1,
    topic: 'Soil Formation and Factors Influencing Pedogenesis', curriculumReleaseId: 'NERDC-JSS-2024.1', curriculumUnitId: 'UNIT-JSS-AGR-006',
    canonicalObjectives: ['describe physical, chemical, and biological weathering', 'state 4 factors of soil formation (parent rock, climate, etc.)', 'analyse soil profile layers in an open trench specimen']
  },
  {
    id: 'BENCH-JS-07', stage: CurriculumStage.junior_secondary, classLevel: 'JSS 2', subject: 'English Studies', term: 1, week: 6,
    topic: 'Direct and Indirect Speech Conversion Rules', curriculumReleaseId: 'NERDC-JSS-2024.1', curriculumUnitId: 'UNIT-JSS-ENG-007',
    canonicalObjectives: ['state tense and pronoun shifting rules in indirect speech', 'convert direct quoted statements into indirect reporting', 'punctuate direct dialogues accurately in narrative writing']
  },
  {
    id: 'BENCH-JS-08', stage: CurriculumStage.junior_secondary, classLevel: 'JSS 2', subject: 'Business Studies', term: 3, week: 2,
    topic: 'Consumer Rights and Redress Agencies (FCCPC)', curriculumReleaseId: 'NERDC-JSS-2024.1', curriculumUnitId: 'UNIT-JSS-BUS-008',
    canonicalObjectives: ['state 4 universal consumer rights (safety, information, etc.)', 'describe procedures for reporting defective goods to FCCPC', 'evaluate mock consumer exploitation scenarios']
  },
  {
    id: 'BENCH-JS-09', stage: CurriculumStage.junior_secondary, classLevel: 'JSS 3', subject: 'Social Studies', term: 1, week: 3,
    topic: 'Drug Abuse and Rehabilitation Measures in Nigeria (NDLEA)', curriculumReleaseId: 'NERDC-JSS-2024.1', curriculumUnitId: 'UNIT-JSS-SOC-009',
    canonicalObjectives: ['differentiate between drug misuse and drug abuse', 'explain the statutory role of NDLEA and NAFDAC', 'analyse socio-economic consequences of drug dependency on youth']
  },
  {
    id: 'BENCH-JS-10', stage: CurriculumStage.junior_secondary, classLevel: 'JSS 3', subject: 'Mathematics', term: 2, week: 1,
    topic: 'Simultaneous Linear Equations by Elimination Method', curriculumReleaseId: 'NERDC-JSS-2024.1', curriculumUnitId: 'UNIT-JSS-MTH-010',
    canonicalObjectives: ['equate coefficients of one variable through multiplication', 'solve pairs of linear simultaneous equations by elimination', 'verify solutions by substituting back into original equations']
  },
  {
    id: 'BENCH-JS-11', stage: CurriculumStage.junior_secondary, classLevel: 'JSS 3', subject: 'Basic Technology', term: 2, week: 4,
    topic: 'Simple Electrical Circuits and Ohm\'s Law', curriculumReleaseId: 'NERDC-JSS-2024.1', curriculumUnitId: 'UNIT-JSS-TEC-011',
    canonicalObjectives: ['state Ohm\'s Law and write formula V = IR', 'differentiate between series and parallel circuit configurations', 'calculate total resistance in simple series networks']
  },
  {
    id: 'BENCH-JS-12', stage: CurriculumStage.junior_secondary, classLevel: 'JSS 3', subject: 'Civic Education', term: 1, week: 5,
    topic: 'Electoral Malpractice and Free Elections (INEC Role)', curriculumReleaseId: 'NERDC-JSS-2024.1', curriculumUnitId: 'UNIT-JSS-CIV-012',
    canonicalObjectives: ['identify forms of electoral malpractice in Nigeria', 'explain the constitutional responsibilities of INEC', 'propose 3 civic remedies to curb vote-buying in elections']
  },

  // ─── Senior Secondary / SSS (13 benchmarks) ──────────────────────────────
  {
    id: 'BENCH-SS-01', stage: CurriculumStage.senior_secondary, classLevel: 'SSS 1', subject: 'Chemistry', term: 1, week: 3,
    topic: 'Atomic Structure and Electron Configuration (Aufbau Principle)', curriculumReleaseId: 'NERDC-SSS-2024.1', curriculumUnitId: 'UNIT-SSS-CHM-001',
    canonicalObjectives: ['state the Aufbau principle and Hund\'s rule of maximum multiplicity', 'write s, p, d electron configurations for atoms from Z=1 to Z=20', 'differentiate between atomic mass number and atomic number']
  },
  {
    id: 'BENCH-SS-02', stage: CurriculumStage.senior_secondary, classLevel: 'SSS 1', subject: 'Government', term: 1, week: 2,
    topic: 'Sovereignty: Characteristics, Types, and Limitations', curriculumReleaseId: 'NERDC-SSS-2024.1', curriculumUnitId: 'UNIT-SSS-GOV-002',
    canonicalObjectives: ['define sovereignty according to Jean Bodin', 'differentiate between legal, political, and de facto sovereignty', 'analyse 4 internal and external limitations on state sovereignty']
  },
  {
    id: 'BENCH-SS-03', stage: CurriculumStage.senior_secondary, classLevel: 'SSS 1', subject: 'Literature in English', term: 1, week: 4,
    topic: 'Dramatic Techniques and Dramatic Irony in Drama', curriculumReleaseId: 'NERDC-SSS-2024.1', curriculumUnitId: 'UNIT-SSS-LIT-003',
    canonicalObjectives: ['define dramatic irony, soliloquy, and aside with textual examples', 'analyse the function of dramatic suspense in prescribed texts', 'evaluate how dramatic choices impact audience engagement']
  },
  {
    id: 'BENCH-SS-04', stage: CurriculumStage.senior_secondary, classLevel: 'SSS 1', subject: 'Biology', term: 1, week: 2,
    topic: 'Cell Structure and Organization of Life', curriculumReleaseId: 'NERDC-SSS-2024.1', curriculumUnitId: 'UNIT-SSS-BIO-004',
    canonicalObjectives: ['draw and label animal and plant cells with organelles', 'differentiate between prokaryotic and eukaryotic organisms', 'state functions of mitochondria, ribosome, and chloroplast']
  },
  {
    id: 'BENCH-SS-05', stage: CurriculumStage.senior_secondary, classLevel: 'SSS 1', subject: 'Physics', term: 2, week: 1,
    topic: 'Equations of Uniformly Accelerated Motion', curriculumReleaseId: 'NERDC-SSS-2024.1', curriculumUnitId: 'UNIT-SSS-PHY-005',
    canonicalObjectives: ['derive the 3 equations of motion analytically and graphically', 'solve multi-step kinematics problems under uniform gravity', 'interpret velocity-time graphs to determine displacement']
  },
  {
    id: 'BENCH-SS-06', stage: CurriculumStage.senior_secondary, classLevel: 'SSS 2', subject: 'Chemistry', term: 2, week: 2,
    topic: 'Chemical Equilibrium and Le Chatelier\'s Principle', curriculumReleaseId: 'NERDC-SSS-2024.1', curriculumUnitId: 'UNIT-SSS-CHM-006',
    canonicalObjectives: ['define dynamic equilibrium in closed chemical systems', 'state Le Chatelier\'s principle clearly', 'predict system shifts when temperature, pressure, or concentration changes']
  },
  {
    id: 'BENCH-SS-07', stage: CurriculumStage.senior_secondary, classLevel: 'SSS 2', subject: 'Economics', term: 1, week: 3,
    topic: 'Elasticity of Demand: Calculation and Practical Determinants', curriculumReleaseId: 'NERDC-SSS-2024.1', curriculumUnitId: 'UNIT-SSS-ECO-007',
    canonicalObjectives: ['calculate price elasticity of demand using midpoint formula', 'distinguish between elastic, inelastic, and unitary elasticity', 'explain 4 real-world determinants influencing consumer elasticity']
  },
  {
    id: 'BENCH-SS-08', stage: CurriculumStage.senior_secondary, classLevel: 'SSS 2', subject: 'Government', term: 2, week: 4,
    topic: 'Federalism: Features and Problems of Federal Finance in Nigeria', curriculumReleaseId: 'NERDC-SSS-2024.1', curriculumUnitId: 'UNIT-SSS-GOV-008',
    canonicalObjectives: ['outline 4 structural characteristics of federal systems of government', 'examine the revenue allocation formula disputes in Nigerian federation', 'evaluate the concept of derivation principle in resource management']
  },
  {
    id: 'BENCH-SS-09', stage: CurriculumStage.senior_secondary, classLevel: 'SSS 2', subject: 'Commerce', term: 1, week: 5,
    topic: 'Insurance: Principles and Utmost Good Faith (Uberrima Fides)', curriculumReleaseId: 'NERDC-SSS-2024.1', curriculumUnitId: 'UNIT-SSS-COM-009',
    canonicalObjectives: ['explain the core insurance principle of insurable interest', 'define utmost good faith, indemnity, and subrogation', 'analyse case studies involving fraudulent claims under contract law']
  },
  {
    id: 'BENCH-SS-10', stage: CurriculumStage.senior_secondary, classLevel: 'SSS 3', subject: 'Literature in English', term: 1, week: 2,
    topic: 'Poetic Devices: Metaphor, Synecdoche, and Enjambment', curriculumReleaseId: 'NERDC-SSS-2024.1', curriculumUnitId: 'UNIT-SSS-LIT-010',
    canonicalObjectives: ['differentiate between metaphor, simile, and synecdoche', 'identify enjambment in unseen WAEC poetry selections', 'compose a critical commentary on tone and thematic resonance']
  },
  {
    id: 'BENCH-SS-11', stage: CurriculumStage.senior_secondary, classLevel: 'SSS 3', subject: 'Financial Accounting', term: 1, week: 4,
    topic: 'Company Accounts: Issue of Shares at Par and Premium', curriculumReleaseId: 'NERDC-SSS-2024.1', curriculumUnitId: 'UNIT-SSS-ACC-011',
    canonicalObjectives: ['distinguish between ordinary shares, preference shares, and debentures', 'prepare journal entries for share allotment, calls, and share premium', 'construct the extracted equity section on the statement of financial position']
  },
  {
    id: 'BENCH-SS-12', stage: CurriculumStage.senior_secondary, classLevel: 'SSS 3', subject: 'Physics', term: 1, week: 3,
    topic: 'Wave-Particle Duality and the Photoelectric Effect (Einstein Equation)', curriculumReleaseId: 'NERDC-SSS-2024.1', curriculumUnitId: 'UNIT-SSS-PHY-012',
    canonicalObjectives: ['state the wave-particle duality hypothesis by de Broglie', 'write and apply Einstein\'s photoelectric equation E = hf - W0', 'calculate threshold frequency and work function of given metal targets']
  },
  {
    id: 'BENCH-SS-13', stage: CurriculumStage.senior_secondary, classLevel: 'SSS 3', subject: 'Chemistry', term: 2, week: 1,
    topic: 'Organic Chemistry: IUPAC Nomenclature of Esters and Alkanols', curriculumReleaseId: 'NERDC-SSS-2024.1', curriculumUnitId: 'UNIT-SSS-CHM-013',
    canonicalObjectives: ['assign systematic IUPAC names to branched alkanols and esters', 'write balanced chemical equations for Fischer esterification with concentrated H2SO4', 'state 2 commercial uses of esters in the food flavour and fragrance industry']
  },
];

/**
 * Creates an authentic, inspection-compliant lesson plan matching benchmark parameters.
 */
export function buildCompliantLessonPlan(bench: BenchmarkCase): LessonPlan & {
  curriculumReleaseId: string;
  curriculumUnitId: string;
} {
  return {
    curriculumReleaseId: bench.curriculumReleaseId,
    curriculumUnitId: bench.curriculumUnitId,
    metadata: {
      subject: bench.subject,
      classLevel: bench.classLevel,
      topic: bench.topic,
      subTopics: [`Core Concepts of ${bench.topic}`, `Applications and Practice of ${bench.topic}`],
      term: bench.term,
      week: bench.week,
      duration: bench.stage === CurriculumStage.early_years ? 30 : 40,
      state: 'Federal',
      session: '2025/2026',
    },
    referenceBooks: [
      `NERDC National Curriculum Guide for ${bench.subject} (${bench.classLevel})`,
      `Approved Ministry Syllabus Reference Text for ${bench.subject}`
    ],
    instructionalMaterials: [
      bench.stage === CurriculumStage.early_years ? 'Colorful picture flashcards and concrete realia' : 'Wall charts, chalkboard diagrams, and sample specimens',
      'Teacher guide manual and pupil workbook worksheets'
    ],
    entryBehaviour: `Learners can recall foundational prerequisite concepts from Week ${Math.max(1, bench.week - 1)}.`,
    previousKnowledge: `Learners are familiar with everyday real-world examples related to ${bench.topic}.`,
    objectives: {
      cognitive: [bench.canonicalObjectives[0], bench.canonicalObjectives[1]],
      affective: bench.canonicalObjectives[2] ? [bench.canonicalObjectives[2]] : ['Show active interest and peer collaboration during lesson tasks'],
      psychomotor: ['Demonstrate practical competence by completing the evaluation exercises accurately in their workbooks'],
    },
    presentation: [
      {
        step: 1,
        title: 'Step 1: Introduction and Prior Knowledge Review',
        teacherActivity: `The teacher introduces ${bench.topic} using interactive questioning, displays illustrative learning aids, and guides pupils to link prior experiences.`,
        studentActivity: 'Pupils observe the instructional materials attentively, respond to the introductory review questions, and write the topic title.',
        duration: '7 minutes',
      },
      {
        step: 2,
        title: 'Step 2: Exploration and Guided Explanation',
        teacherActivity: `The teacher explains ${bench.topic} step-by-step, writes structured notes and formulas on the chalkboard, and models key examples.`,
        studentActivity: 'Pupils listen carefully, participate in answering guided demonstration questions, and copy key summary definitions into their exercise books.',
        duration: '18 minutes',
      },
      {
        step: 3,
        title: 'Step 3: Discussion, Practice, and Classroom Application',
        teacherActivity: 'The teacher assigns structured practice problems, moves around to guide individual pupils, and provides differentiated feedback.',
        studentActivity: 'Pupils work through assigned classroom exercises individually and in pairs, asking clarifying questions where necessary.',
        duration: '10 minutes',
      },
    ],
    commonMisconceptions: [
      {
        description: `Confusing foundational definitions of ${bench.topic} with related concepts`,
        reason: 'Overgeneralization from informal everyday language',
        correction: 'Use explicit comparative board summaries and concrete examples to clarify distinctions',
      }
    ],
    differentiation: {
      support: 'Provide step-by-step cue cards, peer buddy pairing, and additional guided examples.',
      extension: 'Assign higher-order analytical inquiry questions and independent extension tasks.',
    },
    evaluation: [
      `1. Define or state the core concept of ${bench.topic}.`,
      `2. Explain the fundamental principles demonstrated in classroom step 2.`,
      `3. Apply the learning points to solve the assigned diagnostic exercise.`,
    ],
    summary: `The teacher concludes the lesson by reviewing the key takeaways for ${bench.topic} and previewing the next week's theme.`,
    assignment: `Complete questions 1 to 4 on page 32 of the workbook covering ${bench.topic}.`,
  };
}
