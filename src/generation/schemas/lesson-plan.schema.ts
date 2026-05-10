import { z } from 'zod';

export const LessonPlanSchema = z.object({
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
    date: z.string().optional(),
  }),

  objectives: z.array(z.string()).min(1).max(10),

  entryBehaviour: z.string(),

  instructionalMaterials: z.array(z.string()).min(1),

  referenceMaterials: z.array(z.string()),

  introduction: z.object({
    setInduction: z.string(),
    duration: z.string(),
  }),

  development: z.array(
    z.object({
      step: z.number(),
      teacherActivity: z.string(),
      studentActivity: z.string(),
      duration: z.string().optional(),
    }),
  ).min(1),

  evaluation: z.array(z.string()).min(1).max(10),

  conclusion: z.string(),

  assignment: z.string(),
});

export type LessonPlan = z.infer<typeof LessonPlanSchema>;
