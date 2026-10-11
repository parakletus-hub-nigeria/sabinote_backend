import { ResourceType } from '@prisma/client';
import { IsEnum, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class UploadResourceDto {
  @IsString() @IsNotEmpty() @MaxLength(255) resourceName: string;
  @IsEnum(ResourceType) resourceType: ResourceType;
  @IsOptional() @IsString() @MaxLength(150) subject?: string;
  @IsOptional() @IsString() @MaxLength(20) classLevel?: string;
  @IsOptional() @IsString() @MaxLength(100) state?: string;
}
