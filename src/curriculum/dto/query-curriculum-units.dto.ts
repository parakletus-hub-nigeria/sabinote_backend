import { Type } from 'class-transformer';
import { IsNumber, IsOptional, IsString } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class QueryCurriculumUnitsDto {
  @ApiPropertyOptional({ example: 'JSS 1', description: 'Filter by class level' })
  @IsOptional()
  @IsString()
  classLevel?: string;

  @ApiPropertyOptional({ example: 'Mathematics', description: 'Filter by subject name' })
  @IsOptional()
  @IsString()
  subject?: string;

  @ApiPropertyOptional({ example: 1, description: 'Filter by academic term (1, 2, 3)' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  term?: number;

  @ApiPropertyOptional({ example: 1, description: 'Filter by week number (1 to 13)' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  week?: number;
}
