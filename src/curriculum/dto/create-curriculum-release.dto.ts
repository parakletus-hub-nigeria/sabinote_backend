import { IsEnum, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { CurriculumStage, ReleaseStatus } from '@prisma/client';

export class CreateCurriculumReleaseDto {
  @ApiProperty({ example: 'NERDC-JSS-2025.1', description: 'Unique release tag' })
  @IsString()
  @IsNotEmpty()
  releaseTag: string;

  @ApiProperty({
    example: 'NERDC Junior Secondary Curriculum 2025.1',
    description: 'Descriptive title of the curriculum release',
  })
  @IsString()
  @IsNotEmpty()
  title: string;

  @ApiProperty({
    enum: CurriculumStage,
    example: CurriculumStage.junior_secondary,
    description: 'Curriculum educational stage',
  })
  @IsEnum(CurriculumStage)
  stage: CurriculumStage;

  @ApiProperty({ example: '2025.1', description: 'Semantic version or year edition tag' })
  @IsString()
  @IsNotEmpty()
  version: string;

  @ApiPropertyOptional({
    example: 'NERDC',
    description: 'Curriculum source authority code (e.g., NERDC, NAPPS, LEGACY)',
    default: 'NERDC',
  })
  @IsOptional()
  @IsString()
  sourceCode?: string;

  @ApiPropertyOptional({ description: 'Direct CurriculumSource UUID if known' })
  @IsOptional()
  @IsString()
  sourceId?: string;

  @ApiPropertyOptional({
    enum: ReleaseStatus,
    default: ReleaseStatus.draft,
    description: 'Release publishing status',
  })
  @IsOptional()
  @IsEnum(ReleaseStatus)
  status?: ReleaseStatus;

  @ApiPropertyOptional({ description: 'Checksum hash for provenance and tamper verification' })
  @IsOptional()
  @IsString()
  checksum?: string;

  @ApiPropertyOptional({ description: 'Extensible JSON metadata' })
  @IsOptional()
  metadata?: Record<string, any>;
}
