import { Type } from 'class-transformer';
import { IsArray, IsNumber, IsOptional, IsString, ValidateNested } from 'class-validator';

export class GeneralCurriculumWeekDto {
  @IsString() subject: string;
  @IsString() classLevel: string;
  @IsNumber() term: number;
  @IsNumber() week: number;
  @IsString() topic: string;
  @IsArray() @IsString({ each: true }) subTopics: string[];
  @IsArray() @IsString({ each: true }) objectives: string[];
  @IsOptional() @IsString() teachingActivities?: string;
  @IsOptional() @IsString() teachingAids?: string;
  @IsOptional() @IsString() evaluation?: string;
  @IsOptional() @IsString() referenceText?: string;
  // Curriculum edition — `year` participates in the unique key so multiple
  // editions (e.g. 2023 and 2025) of the same subject/class/term/week coexist.
  @IsOptional() @IsString() year?: string;
  @IsOptional() @IsString() version?: string;
}

export class SeedGeneralCurriculumDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => GeneralCurriculumWeekDto)
  weeks: GeneralCurriculumWeekDto[];
}
