import { IsEnum, IsOptional } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { CurriculumStage, ReleaseStatus } from '@prisma/client';

export class QueryReleasesDto {
  @ApiPropertyOptional({
    enum: CurriculumStage,
    description: 'Filter curriculum releases by educational stage',
  })
  @IsOptional()
  @IsEnum(CurriculumStage)
  stage?: CurriculumStage;

  @ApiPropertyOptional({
    enum: ReleaseStatus,
    description: 'Filter curriculum releases by status (draft, published, superseded, archived)',
  })
  @IsOptional()
  @IsEnum(ReleaseStatus)
  status?: ReleaseStatus;
}
