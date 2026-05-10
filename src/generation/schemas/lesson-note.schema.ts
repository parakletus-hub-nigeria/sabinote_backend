import { z } from 'zod';

export const LessonNoteSchema = z.object({
  metadata: z.object({
    subject: z.string(),
    classLevel: z.string(),
    topic: z.string(),
    subTopics: z.array(z.string()),
    term: z.number(),
    week: z.number(),
    duration: z.number(),
    state: z.string(),
    session: z.string().optional(),
  }),

  introduction: z.object({
    narrative: z.string(),
    priorKnowledge: z.string(),
    duration: z.string(),
  }),

  body: z.array(
    z.object({
      subTopic: z.string(),
      explanation: z.string(),
      teacherNarrative: z.string(),
      workedExamples: z.array(
        z.object({
          problem: z.string(),
          solution: z.string(),
        }),
      ),
      boardSummary: z.array(z.string()),
    }),
  ).min(1),

  misconceptions: z.array(
    z.object({
      misconception: z.string(),
      correction: z.string(),
    }),
  ),

  differentiation: z.object({
    slowerLearners: z.string(),
    fasterLearners: z.string(),
  }),

  formativeAssessment: z.array(
    z.object({
      question: z.string(),
      expectedAnswer: z.string(),
    }),
  ).min(1),

  conclusion: z.string(),

  assignment: z.array(z.string()).min(1).max(5),
});

export type LessonNote = z.infer<typeof LessonNoteSchema>;
