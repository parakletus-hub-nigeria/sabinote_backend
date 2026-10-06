import { Type } from 'class-transformer';
import {
  IsArray,
  IsNumber,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CurriculumUnitInputDto {
  @ApiProperty({ example: 'JSS 1', description: 'Class level designation' })
  @IsString()
  classLevel: string;

  @ApiProperty({ example: 'Mathematics', description: 'Subject name' })
  @IsString()
  subject: string;

  @ApiProperty({ example: 1, description: 'Academic term (1, 2, or 3)' })
  @IsNumber()
  term: number;

  @ApiProperty({ example: 1, description: 'Curriculum week number (1 to 13)' })
  @IsNumber()
  week: number;

  @ApiProperty({ example: 'Whole Numbers', description: 'Main topic of instruction' })
  @IsString()
  topic: string;

  @ApiPropertyOptional({
    type: [String],
    description: 'Subtopics covered in this unit',
    default: [],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  subTopics?: string[];

  @ApiPropertyOptional({
    type: [String],
    description: 'Measurable student learning objectives',
    default: [],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  learningObjectives?: string[];

  @ApiPropertyOptional({
    type: [String],
    description: 'Key competencies developed (e.g. Critical Thinking, Numeracy)',
    default: [],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  competencies?: string[];

  @ApiPropertyOptional({ description: 'Detailed teacher and student learning activities' })
  @IsOptional()
  @IsString()
  teachingActivities?: string;

  @ApiPropertyOptional({ description: 'Recommended teaching aids and materials' })
  @IsOptional()
  @IsString()
  teachingAids?: string;

  @ApiPropertyOptional({ description: 'Evaluation guide and assessment questions' })
  @IsOptional()
  @IsString()
  evaluationGuide?: string;

  @ApiPropertyOptional({
    type: [String],
    description: 'Recommended textbooks and reference materials',
    default: [],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  referenceMaterials?: string[];

  @ApiPropertyOptional({ description: 'Arbitrary structured metadata' })
  @IsOptional()
  metadata?: Record<string, any>;
}

export class SeedCurriculumUnitsDto {
  @ApiProperty({
    type: [CurriculumUnitInputDto],
    description: 'Array of versioned curriculum units to import or seed',
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CurriculumUnitInputDto)
  units: CurriculumUnitInputDto[];
}
