import { IsArray, IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export class NoteFeedbackDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(5)
  rating?: number;

  @IsOptional()
  @IsIn(['thumbs_up', 'thumbs_down'])
  sentiment?: 'thumbs_up' | 'thumbs_down';

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];

  @IsOptional()
  @IsString()
  comment?: string;
}
