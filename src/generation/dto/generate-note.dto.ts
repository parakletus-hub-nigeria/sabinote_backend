import { IsObject, IsOptional, IsUUID } from 'class-validator';
import type { LessonPlan } from '../schemas/lesson-plan.schema';

export class GenerateNoteDto {
  @IsUUID() noteId: string;
  @IsOptional() @IsObject() editedLessonPlan?: LessonPlan;
}
