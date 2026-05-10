import { IsString } from 'class-validator';

export class InitiateTopupDto {
  @IsString()
  packageId: string;
}
