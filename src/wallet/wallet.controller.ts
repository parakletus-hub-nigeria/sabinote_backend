import {
  Body, Controller, Get, HttpCode, HttpStatus,
  Post, Query, Req, UseGuards,
} from '@nestjs/common';
import type { RawBodyRequest } from '@nestjs/common';
import type { Request } from 'express';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { InitiateTopupDto } from './dto/initiate-topup.dto';
import { WalletService } from './wallet.service';

@Controller('wallet')
export class WalletController {
  constructor(private walletService: WalletService) {}

  @UseGuards(JwtAuthGuard)
  @Get()
  async getBalance(@CurrentUser() user: { userId: string }) {
    return { success: true, data: await this.walletService.getBalance(user.userId) };
  }

  @UseGuards(JwtAuthGuard)
  @Get('transactions')
  async getTransactions(
    @CurrentUser() user: { userId: string },
    @Query('page') page = '1',
    @Query('limit') limit = '20',
  ) {
    return {
      success: true,
      data: await this.walletService.getTransactions(user.userId, +page, +limit),
    };
  }

  @UseGuards(JwtAuthGuard)
  @Get('packages')
  getPackages() {
    return { success: true, data: { packages: this.walletService.getPackages() } };
  }

  @UseGuards(JwtAuthGuard)
  @Post('topup/initiate')
  async initiateTopup(@CurrentUser() user: { userId: string }, @Body() dto: InitiateTopupDto) {
    return { success: true, data: await this.walletService.initiateTopup(user.userId, dto) };
  }

  @UseGuards(JwtAuthGuard)
  @Post('topup/verify')
  @HttpCode(HttpStatus.OK)
  async verifyTopup(@CurrentUser() user: { userId: string }, @Body('reference') reference: string) {
    return { success: true, data: await this.walletService.verifyTopup(user.userId, reference) };
  }

  // No JWT guard — Paystack calls this directly. Validated by HMAC signature.
  @Post('webhook')
  @HttpCode(HttpStatus.OK)
  async webhook(@Req() req: RawBodyRequest<Request>) {
    const sig = req.headers['x-paystack-signature'] as string;
    await this.walletService.handleWebhook(req.rawBody!, sig);
    return { success: true };
  }
}
