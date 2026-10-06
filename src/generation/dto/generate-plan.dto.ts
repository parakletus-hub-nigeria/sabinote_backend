import { IsNumber, IsOptional, IsPositive, IsUUID } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class GeneratePlanDto {
  /** ID from versioned CurriculumUnit (v2 release-first). */
  @ApiPropertyOptional({ description: 'ID from versioned CurriculumUnit (v2 release-first)' })
  @IsOptional()
  @IsUUID()
  curriculumUnitId?: string;

  /** ID from CurriculumWeek (state-specific). Provide this, generalCurriculumId, or curriculumUnitId. */
  @ApiPropertyOptional({ description: 'ID from CurriculumWeek (state-specific)' })
  @IsOptional()
  @IsUUID()
  curriculumWeekId?: string;

  /** ID from GeneralCurriculum (national fallback). */
  @ApiPropertyOptional({ description: 'ID from GeneralCurriculum (legacy national fallback)' })
  @IsOptional()
  @IsUUID()
  generalCurriculumId?: string;

  @ApiProperty({ example: 45, description: 'Duration of lesson in minutes' })
  @IsNumber()
  @IsPositive()
  durationMinutes: number;

  @ApiPropertyOptional({ description: 'Optional uploaded resource ID for RAG grounding' })
  @IsOptional()
  @IsUUID()
  resourceId?: string;

  @ApiPropertyOptional({ description: 'Teacher selected classroom learning aids / instructional materials' })
  @IsOptional()
  learningAids?: string[];

  @ApiPropertyOptional({
    description: 'Pedagogical emphasis / tone: standard, hands_on, exam_focus, remedial',
    example: 'hands_on',
  })
  @IsOptional()
  pedagogicalEmphasis?: string;
}
