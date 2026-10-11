import { IsOptional, IsString } from 'class-validator';

export class DeleteAccountDto {
  /** Required when the account has a password. */
  @IsOptional()
  @IsString()
  password?: string;
}
