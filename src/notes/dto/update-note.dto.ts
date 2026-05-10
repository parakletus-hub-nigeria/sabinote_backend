import { IsOptional, IsString } from 'class-validator';

export class UpdateNoteDto {
  @IsOptional() @IsString() lessonPlanContent?: string;
  @IsOptional() @IsString() lessonNoteContent?: string;
}
