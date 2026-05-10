import { IsEnum, IsOptional, IsString, IsUUID } from 'class-validator';

export class RegenerateDto {
  @IsUUID() noteId: string;
  @IsEnum(['plan', 'note']) phase: 'plan' | 'note';
  @IsOptional() @IsString() additionalInstructions?: string;
}
