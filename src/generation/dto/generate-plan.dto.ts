import { IsNumber, IsOptional, IsPositive, IsString, IsUUID } from 'class-validator';

export class GeneratePlanDto {
  @IsUUID() curriculumWeekId: string;
  @IsNumber() @IsPositive() durationMinutes: number;
  @IsOptional() @IsUUID() resourceId?: string;
}
