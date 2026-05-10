import { DifficultyLevel } from '@prisma/client';
import { IsBoolean, IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateSettingsDto {
  @IsOptional() @IsString() @MaxLength(100) defaultState?: string;
  @IsOptional() @IsBoolean() alwaysConfirmState?: boolean;
  @IsOptional() @IsEnum(DifficultyLevel) noteDifficultyLevel?: DifficultyLevel;
  @IsOptional() @IsString() @MaxLength(100) defaultSubject?: string;
  @IsOptional() @IsString() @MaxLength(20) defaultClassLevel?: string;
  @IsOptional() @IsBoolean() emailNotifications?: boolean;
}
