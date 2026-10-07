import { z } from 'zod';
import { DiagramSchema } from './diagram.schema';

const BaseLessonNoteSchema = z.object({
  header: z.object({
    subject: z.string().default(''),
    classLevel: z.string().default(''),
    topic: z.string().default(''),
    subTopics: z.array(z.string()).default([]),
    term: z.coerce.number().default(1),
    week: z.coerce.number().default(1),
    duration: z.string().default('40 minutes'), // e.g. "40 minutes"
    state: z.string().default(''),
    session: z.string().optional(),
  }),

  referenceBooks: z.array(z.string()).min(1),

  instructionalMaterials: z.array(z.string()).min(1),

  // Specific prerequisite skills students MUST possess to access this lesson
  entryBehaviour: z.string(),

  // Related content from previous lessons used to bridge to today's topic
  previousKnowledge: z.string(),

  objectives: z.object({
    // Bloom's taxonomy: identify, define, state, explain, calculate, apply, analyse, compare, evaluate
    cognitive: z.array(z.string()).min(2),
    // Values and attitudes: appreciate, value, show interest, cooperate, demonstrate willingness
    affective: z.array(z.string()).min(1),
    // Observable skills: draw, construct, measure, demonstrate, perform, use
    psychomotor: z.array(z.string()).min(1),
  }),

  // Full 3-step NERDC lesson presentation with complete teaching content
  presentation: z.array(
    z.object({
      step: z.coerce.number(),
      // Step 1: "Identification of Prior Ideas" — Step 2: "Exploration" — Step 3: "Discussion & Application"
      title: z.string(),
      teacherActivity: z.string(),   // what the teacher does/says in this step
      studentActivity: z.string(),   // what students do in this step
      // Full teaching content, explanation, narrative, questions asked — enough for a substitute teacher
      content: z.string(),
      duration: z.string().optional(),
    }),
  ).min(3),

  // Detailed subject content per sub-topic — the academic knowledge section
  subjectContent: z.array(
    z.object({
      subTopic: z.string(),
      // Complete conceptual explanation a student can study from
      explanation: z.string(),
      workedExamples: z.array(
        z.object({
          problem: z.string(),
          solution: z.string(), // full step-by-step working
        }),
      ),
      // Key sentences/rules to write on the board
      keyPoints: z.array(z.string()).min(2),
      // Optional visual diagram for this sub-topic
      diagram: DiagramSchema.optional(),
    }),
  ).min(1),

  // Concise points written on the board for students to copy
  boardSummary: z.array(z.string()).min(2),

  commonMisconceptions: z.array(
    z.object({
      description: z.string(),
      reason: z.string(),
      correction: z.string(),
    })
  ).min(1),

  differentiation: z.object({
    support: z.string(),
    extension: z.string(),
  }),

  evaluation: z.array(
    z.object({
      question: z.string(),
      expectedAnswer: z.string(),
    }),
  ).min(2),

  // How the teacher wraps up the lesson — recap, connecting to next lesson
  summary: z.string(),

  assignment: z.array(z.string()).min(1),
});

export const LessonNoteSchema = z.preprocess((val: any) => {
  if (!val || typeof val !== 'object') return val;
  const obj = { ...val };

  // Normalize header
  if (!obj.header || typeof obj.header !== 'object') {
    obj.header = {};
  } else {
    obj.header = { ...obj.header };
  }
  if (!Array.isArray(obj.header.subTopics)) {
    obj.header.subTopics = typeof obj.header.subTopics === 'string' && obj.header.subTopics.trim()
      ? [obj.header.subTopics.trim()]
      : (obj.header.topic ? [obj.header.topic] : []);
  }
  if (typeof obj.header.duration !== 'string') {
    obj.header.duration = obj.header.duration ? `${obj.header.duration} minutes` : '40 minutes';
  }

  // Handle entryBehaviour vs entryBehavior
  if (!obj.entryBehaviour && obj.entryBehavior) {
    obj.entryBehaviour = obj.entryBehavior;
  }
  if (!obj.entryBehaviour || typeof obj.entryBehaviour !== 'string') {
    obj.entryBehaviour = 'Pupils have foundational knowledge of previous class topics and basic vocabulary.';
  }

  // Handle previousKnowledge
  if (!obj.previousKnowledge || typeof obj.previousKnowledge !== 'string') {
    obj.previousKnowledge = 'Revision of introductory concepts covered in the preceding academic week.';
  }

  // Handle referenceBooks
  if (!Array.isArray(obj.referenceBooks) || obj.referenceBooks.length === 0) {
    obj.referenceBooks = typeof obj.referenceBooks === 'string' && obj.referenceBooks.trim()
      ? [obj.referenceBooks.trim()]
      : ['NERDC Curriculum Guidelines', 'Approved Ministry of Education Subject Textbook'];
  }

  // Handle instructionalMaterials
  if (!Array.isArray(obj.instructionalMaterials) || obj.instructionalMaterials.length === 0) {
    obj.instructionalMaterials = typeof obj.instructionalMaterials === 'string' && obj.instructionalMaterials.trim()
      ? [obj.instructionalMaterials.trim()]
      : ['Chalkboard and coloured chalks', 'Approved textbook and illustrative wall charts'];
  }

  // Handle objectives
  if (!obj.objectives || typeof obj.objectives !== 'object') {
    obj.objectives = { cognitive: [], affective: [], psychomotor: [] };
  } else {
    obj.objectives = { ...obj.objectives };
  }
  if (!Array.isArray(obj.objectives.cognitive) || obj.objectives.cognitive.length < 2) {
    const base = Array.isArray(obj.objectives.cognitive) ? [...obj.objectives.cognitive] : [];
    if (base.length === 0) {
      base.push(`Define and explain fundamental principles of ${obj.header?.topic || 'the lesson topic'}.`);
    }
    if (base.length === 1) {
      base.push(`Demonstrate understanding by solving illustrative exercises on ${obj.header?.topic || 'the topic'}.`);
    }
    obj.objectives.cognitive = base;
  }
  if (!Array.isArray(obj.objectives.affective) || obj.objectives.affective.length === 0) {
    obj.objectives.affective = ['Appreciate the practical importance and relevance of the topic in daily life.'];
  }
  if (!Array.isArray(obj.objectives.psychomotor) || obj.objectives.psychomotor.length === 0) {
    obj.objectives.psychomotor = ['Record neat chalkboard summaries and participate in group exercises.'];
  }

  // Handle presentation
  if (!Array.isArray(obj.presentation) || obj.presentation.length === 0) {
    obj.presentation = [
      { step: 1, title: 'Identification of Prior Ideas', teacherActivity: 'Teacher reviews prior knowledge through diagnostic questions.', studentActivity: 'Students recall previous lessons and answer questions.', content: 'Teacher probes students on fundamental concepts.' },
      { step: 2, title: 'Exploration & Concept Demonstration', teacherActivity: 'Teacher introduces new topic using board illustrations and instructional aids.', studentActivity: 'Students listen attentively, take notes, and ask clarifying questions.', content: 'Detailed conceptual demonstration and board work.' },
      { step: 3, title: 'Discussion & Practical Activity', teacherActivity: 'Teacher guides students through structured practice exercises.', studentActivity: 'Students complete practical exercises in their notebooks.', content: 'Interactive problem solving and class discussion.' },
    ];
  } else {
    obj.presentation = obj.presentation.map((p: any, idx: number) => ({
      step: Number(p?.step) || (idx + 1),
      title: p?.title || (idx === 0 ? 'Identification of Prior Ideas' : idx === 1 ? 'Concept Demonstration' : 'Pupil Practice'),
      teacherActivity: p?.teacherActivity || 'Teacher leads classroom demonstration and interaction.',
      studentActivity: p?.studentActivity || 'Students participate actively in classroom exercises.',
      content: p?.content || p?.teacherActivity || 'Instructional content delivered during this lesson phase.',
      duration: p?.duration ? String(p?.duration) : undefined,
    }));
    while (obj.presentation.length < 3) {
      const idx = obj.presentation.length;
      obj.presentation.push({
        step: idx + 1,
        title: idx === 1 ? 'Concept Demonstration' : 'Pupil Practice',
        teacherActivity: 'Teacher facilitates classroom instruction.',
        studentActivity: 'Students engage with the materials and record board notes.',
        content: 'Continued instructional engagement and concept reinforcement.',
      });
    }
  }

  // Handle subjectContent
  if (!Array.isArray(obj.subjectContent) || obj.subjectContent.length === 0) {
    obj.subjectContent = [
      {
        subTopic: obj.header?.topic || 'General Overview',
        explanation: 'Detailed conceptual overview covering principles and applications.',
        workedExamples: [
          { problem: 'Standard illustrative exercise', solution: 'Step-by-step working and solution.' },
        ],
        keyPoints: ['Core definition and principles', 'Important classroom takeaway'],
      },
    ];
  } else {
    obj.subjectContent = obj.subjectContent.map((sc: any) => ({
      subTopic: sc?.subTopic || obj.header?.topic || 'Core Concept',
      explanation: sc?.explanation || 'Comprehensive explanation of the sub-topic.',
      workedExamples: Array.isArray(sc?.workedExamples) && sc.workedExamples.length > 0
        ? sc.workedExamples.map((we: any) => ({
            problem: we?.problem || 'Illustrative Example',
            solution: we?.solution || 'Detailed step-by-step resolution.',
          }))
        : [{ problem: 'Example application', solution: 'Guided step-by-step working.' }],
      keyPoints: Array.isArray(sc?.keyPoints) && sc.keyPoints.length >= 2
        ? sc.keyPoints
        : Array.isArray(sc?.keyPoints) && sc.keyPoints.length === 1
        ? [sc.keyPoints[0], 'Review key terms and practice problem types.']
        : ['Core principle of the topic', 'Essential rule to remember'],
      diagram: sc?.diagram,
    }));
  }

  // Handle boardSummary
  if (!Array.isArray(obj.boardSummary) || obj.boardSummary.length < 2) {
    const base = Array.isArray(obj.boardSummary) ? [...obj.boardSummary] : (typeof obj.boardSummary === 'string' ? [obj.boardSummary] : []);
    while (base.length < 2) {
      base.push(`Key board summary point ${base.length + 1} for pupil notebook copy.`);
    }
    obj.boardSummary = base;
  }

  // Handle commonMisconceptions
  if (!Array.isArray(obj.commonMisconceptions) || obj.commonMisconceptions.length === 0) {
    obj.commonMisconceptions = [
      {
        description: `Learners may confuse foundational concepts of ${obj.header?.topic || 'this topic'} with casual terminology.`,
        reason: 'Everyday colloquial usage overlaps with academic definitions.',
        correction: 'Teacher highlights precise technical definitions and contrasts them with board examples.',
      },
    ];
  } else {
    obj.commonMisconceptions = obj.commonMisconceptions.map((m: any) => {
      if (typeof m === 'string') {
        return {
          description: m,
          reason: 'Common conceptual confusion among Nigerian secondary school students.',
          correction: 'Teacher provides targeted correction and board illustrations.',
        };
      }
      return {
        description: m?.description || 'Common conceptual error observed in class.',
        reason: m?.reason || 'Confusion with related topics.',
        correction: m?.correction || 'Teacher clarifies with direct examples and formative questions.',
      };
    });
  }

  // Handle differentiation
  if (!obj.differentiation || typeof obj.differentiation !== 'object') {
    const diffStr = typeof obj.differentiation === 'string' ? obj.differentiation : '';
    obj.differentiation = {
      support: diffStr || 'Provide simplified step-by-step scaffolding and peer pairing for struggling learners.',
      extension: 'Assign deeper inquiry questions and peer tutor roles to advanced learners.',
    };
  } else {
    obj.differentiation = {
      support: obj.differentiation.support || 'Provide simplified step-by-step scaffolding and peer pairing for struggling learners.',
      extension: obj.differentiation.extension || 'Assign deeper inquiry questions and peer tutor roles to advanced learners.',
    };
  }

  // Handle evaluation
  if (!Array.isArray(obj.evaluation) || obj.evaluation.length < 2) {
    const base = Array.isArray(obj.evaluation)
      ? obj.evaluation.map((e: any) => typeof e === 'string' ? { question: e, expectedAnswer: 'Expected student answer.' } : e)
      : (typeof obj.evaluation === 'string' ? [{ question: obj.evaluation, expectedAnswer: 'Expected answer.' }] : []);
    while (base.length < 2) {
      base.push({
        question: `Explain the key concepts of today's lesson (Question ${base.length + 1}).`,
        expectedAnswer: 'Demonstrate accurate recall and understanding of key definitions.',
      });
    }
    obj.evaluation = base;
  } else {
    obj.evaluation = obj.evaluation.map((e: any, idx: number) => {
      if (typeof e === 'string') {
        return { question: e, expectedAnswer: 'Accurate conceptual answer.' };
      }
      return {
        question: e?.question || `Evaluation question ${idx + 1}`,
        expectedAnswer: e?.expectedAnswer || 'Expected conceptual answer.',
      };
    });
  }

  // Handle summary
  if (!obj.summary || typeof obj.summary !== 'string') {
    obj.summary = 'Teacher summarizes the main points on the chalkboard, emphasizes key takeaways, and commends student participation.';
  }

  // Handle assignment
  if (!Array.isArray(obj.assignment) || obj.assignment.length === 0) {
    obj.assignment = typeof obj.assignment === 'string' && obj.assignment.trim()
      ? [obj.assignment.trim()]
      : ['Complete the practice questions in the approved textbook covering today’s sub-topics.'];
  }

  return obj;
}, BaseLessonNoteSchema);

export type LessonNote = z.infer<typeof LessonNoteSchema>;
