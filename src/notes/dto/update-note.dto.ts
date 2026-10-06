import { IsOptional } from 'class-validator';

export class UpdateNoteDto {
  @IsOptional()
  lessonPlanContent?: Record<string, any> | string;

  @IsOptional()
  lessonNoteContent?: Record<string, any> | string;
}
