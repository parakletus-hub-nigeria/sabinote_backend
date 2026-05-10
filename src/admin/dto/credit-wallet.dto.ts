import { IsNumber, IsPositive, IsString, IsUUID } from 'class-validator';

export class CreditWalletDto {
  @IsUUID() userId: string;
  @IsNumber() @IsPositive() amount: number;
  @IsString() reason: string;
}
