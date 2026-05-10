import { Type } from 'class-transformer';
import { IsArray, IsNumber, IsOptional, IsString, ValidateNested } from 'class-validator';

export class CurriculumWeekDto {
  @IsString() state: string;
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
}

export class SeedCurriculumDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CurriculumWeekDto)
  weeks: CurriculumWeekDto[];
}
