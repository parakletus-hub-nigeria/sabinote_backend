import { z } from 'zod';

const BaseLessonPlanSchema = z.object({
  metadata: z.object({
    subject: z.string().default(''),
    classLevel: z.string().default(''),
    topic: z.string().default(''),
    subTopics: z.array(z.string()).default([]),
    term: z.coerce.number().default(1),
    week: z.coerce.number().default(1),
    duration: z.coerce.number().default(40), // in minutes
    state: z.string().default(''),
    session: z.string().optional(),
  }),

  referenceBooks: z.array(z.string()).min(1),

  instructionalMaterials: z.array(z.string()).min(1),

  // Prerequisites students MUST already have to follow this lesson
  entryBehaviour: z.string(),

  // Related content learned in previous lessons — used for review/bridging
  previousKnowledge: z.string(),

  objectives: z.object({
    // Bloom's taxonomy — knowledge, comprehension, application, analysis
    cognitive: z.array(z.string()).min(2),
    // Values, attitudes, appreciation
    affective: z.array(z.string()).min(1),
    // Observable physical/practical skills
    psychomotor: z.array(z.string()).min(1),
  }),

  // 3-step NERDC presentation format
  presentation: z.array(
    z.object({
      step: z.coerce.number(),
      title: z.string(), // e.g. "Identification of Prior Ideas", "Exploration", "Discussion"
      teacherActivity: z.string(),
      studentActivity: z.string(),
      duration: z.string().optional(),
    }),
  ).min(3),

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

  evaluation: z.array(z.string()).min(3),

  summary: z.string(),

  assignment: z.string(),
});

export const LessonPlanSchema = z.preprocess((val: any) => {
  if (!val || typeof val !== 'object') return val;
  const obj = { ...val };

  // Normalize metadata
  if (!obj.metadata || typeof obj.metadata !== 'object') {
    obj.metadata = {};
  } else {
    obj.metadata = { ...obj.metadata };
  }
  if (!Array.isArray(obj.metadata.subTopics)) {
    obj.metadata.subTopics = typeof obj.metadata.subTopics === 'string' && obj.metadata.subTopics.trim()
      ? [obj.metadata.subTopics.trim()]
      : (obj.metadata.topic ? [obj.metadata.topic] : []);
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
      base.push(`Define and explain fundamental principles of ${obj.metadata?.topic || 'the lesson topic'}.`);
    }
    if (base.length === 1) {
      base.push(`Demonstrate understanding by solving illustrative exercises on ${obj.metadata?.topic || 'the topic'}.`);
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
      { step: 1, title: 'Identification of Prior Ideas', teacherActivity: 'Teacher reviews prior knowledge through diagnostic questions.', studentActivity: 'Students recall previous lessons and answer questions.' },
      { step: 2, title: 'Exploration & Concept Demonstration', teacherActivity: 'Teacher introduces new topic using board illustrations and instructional aids.', studentActivity: 'Students listen attentively, take notes, and ask clarifying questions.' },
      { step: 3, title: 'Discussion & Practical Activity', teacherActivity: 'Teacher guides students through structured practice exercises.', studentActivity: 'Students complete practical exercises in their notebooks.' },
    ];
  } else {
    obj.presentation = obj.presentation.map((p: any, idx: number) => ({
      step: Number(p?.step) || (idx + 1),
      title: p?.title || (idx === 0 ? 'Identification of Prior Ideas' : idx === 1 ? 'Concept Demonstration' : 'Pupil Practice'),
      teacherActivity: p?.teacherActivity || 'Teacher leads classroom demonstration and interaction.',
      studentActivity: p?.studentActivity || 'Students participate actively in classroom exercises.',
      duration: p?.duration ? String(p?.duration) : undefined,
    }));
    while (obj.presentation.length < 3) {
      const idx = obj.presentation.length;
      obj.presentation.push({
        step: idx + 1,
        title: idx === 1 ? 'Concept Demonstration' : 'Pupil Practice',
        teacherActivity: 'Teacher facilitates classroom instruction.',
        studentActivity: 'Students engage with the materials and record board notes.',
      });
    }
  }

  // Handle commonMisconceptions
  if (!Array.isArray(obj.commonMisconceptions) || obj.commonMisconceptions.length === 0) {
    obj.commonMisconceptions = [
      {
        description: `Learners may confuse foundational concepts of ${obj.metadata?.topic || 'this topic'} with casual terminology.`,
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
  if (!Array.isArray(obj.evaluation) || obj.evaluation.length < 3) {
    const base = Array.isArray(obj.evaluation)
      ? [...obj.evaluation]
      : (typeof obj.evaluation === 'string' && obj.evaluation.trim() ? [obj.evaluation.trim()] : []);
    while (base.length < 3) {
      base.push(`State and explain key learning outcomes from today's lesson (Evaluation Task ${base.length + 1}).`);
    }
    obj.evaluation = base;
  }

  // Handle summary
  if (!obj.summary || typeof obj.summary !== 'string') {
    obj.summary = 'Teacher summarizes the main points on the chalkboard, emphasizes key takeaways, and commends student participation.';
  }

  // Handle assignment
  if (!obj.assignment || typeof obj.assignment !== 'string') {
    obj.assignment = 'Complete the review exercises in the approved textbook covering today’s sub-topics.';
  }

  return obj;
}, BaseLessonPlanSchema);

export type LessonPlan = z.infer<typeof LessonPlanSchema>;
