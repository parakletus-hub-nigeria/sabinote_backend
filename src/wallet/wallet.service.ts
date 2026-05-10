import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NotificationType, TransactionPurpose, TransactionStatus, TransactionType } from '@prisma/client';
import axios from 'axios';
import * as crypto from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { InitiateTopupDto } from './dto/initiate-topup.dto';

export interface ParatsPackage {
  id: string;
  parats: number;
  priceNGN: number;
}

@Injectable()
export class WalletService {
  private paystackBase = 'https://api.paystack.co';
  private packages: ParatsPackage[];

  constructor(
    private prisma: PrismaService,
    private config: ConfigService,
  ) {
    const raw = config.get<string>(
      'PARATS_PACKAGES',
      '[{"id":"pkg_50","parats":50,"priceNGN":250},{"id":"pkg_100","parats":100,"priceNGN":500},{"id":"pkg_500","parats":500,"priceNGN":2000}]',
    );
    this.packages = JSON.parse(raw);
  }

  getPackages() {
    return this.packages;
  }

  async getBalance(userId: string) {
    const wallet = await this.prisma.wallet.findUnique({ where: { userId } });
    if (!wallet) throw new NotFoundException('Wallet not found');
    return wallet;
  }

  async getTransactions(userId: string, page = 1, limit = 20) {
    const skip = (page - 1) * limit;
    const [transactions, total] = await Promise.all([
      this.prisma.transaction.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.transaction.count({ where: { userId } }),
    ]);
    return { transactions, pagination: { page, limit, total } };
  }

  async initiateTopup(userId: string, dto: InitiateTopupDto) {
    // Resolve package from server-side config — never trust client-provided amounts
    const pkg = this.packages.find((p) => p.id === dto.packageId);
    if (!pkg) throw new BadRequestException(`Unknown package: ${dto.packageId}`);

    const user = await this.prisma.user.findUnique({
      where: { userId },
      select: { email: true },
    });
    if (!user) throw new NotFoundException('User not found');

    const wallet = await this.prisma.wallet.findUnique({ where: { userId } });
    if (!wallet) throw new NotFoundException('Wallet not found');

    const reference = `sabi_${Date.now()}_${userId.slice(0, 8)}`;

    // amountAdded stores the Parats to be credited (not NGN)
    const transaction = await this.prisma.transaction.create({
      data: {
        walletId: wallet.walletId,
        userId,
        type: TransactionType.credit,
        amountAdded: pkg.parats,
        balanceBefore: wallet.balance,
        balanceAfter: wallet.balance, // will be updated after payment confirms
        purpose: TransactionPurpose.topup,
        paystackReference: reference,
        description: `Top up ${pkg.parats} Parats (₦${pkg.priceNGN})`,
        status: TransactionStatus.pending,
      },
    });

    const callbackUrl = this.config.get<string>('PAYSTACK_CALLBACK_URL');

    const response = await axios.post(
      `${this.paystackBase}/transaction/initialize`,
      {
        email: user.email,
        amount: pkg.priceNGN * 100, // Paystack expects kobo
        reference,
        ...(callbackUrl && { callback_url: callbackUrl }),
        metadata: {
          userId,
          parats: pkg.parats,
          packageId: pkg.id,
          transactionId: transaction.transactionId,
        },
      },
      {
        headers: {
          Authorization: `Bearer ${this.config.getOrThrow('PAYSTACK_SECRET_KEY')}`,
        },
      },
    );

    return {
      authorizationUrl: response.data.data.authorization_url,
      reference,
      transactionId: transaction.transactionId,
      package: pkg,
    };
  }

  async verifyTopup(userId: string, reference: string) {
    // Confirm the reference belongs to this user before verifying
    const txRecord = await this.prisma.transaction.findFirst({
      where: { paystackReference: reference, userId },
    });
    if (!txRecord) throw new NotFoundException('Transaction not found');

    const response = await axios.get(
      `${this.paystackBase}/transaction/verify/${reference}`,
      { headers: { Authorization: `Bearer ${this.config.getOrThrow('PAYSTACK_SECRET_KEY')}` } },
    );

    if (response.data.data.status !== 'success') {
      throw new BadRequestException('Payment not yet successful');
    }

    await this.creditWallet(reference, response.data.data.metadata);
    return { credited: true, reference };
  }

  async handleWebhook(rawBody: Buffer, signature: string) {
    const secret = this.config.getOrThrow('PAYSTACK_WEBHOOK_SECRET');
    const hash = crypto.createHmac('sha512', secret).update(rawBody).digest('hex');

    if (hash !== signature) return; // silently ignore invalid signatures

    const event = JSON.parse(rawBody.toString());
    if (event.event === 'charge.success') {
      const { reference, metadata } = event.data;
      await this.creditWallet(reference, metadata);
    }
  }

  private async creditWallet(reference: string, metadata: any) {
    // Idempotency check — never double-credit
    const alreadyProcessed = await this.prisma.transaction.findFirst({
      where: { paystackReference: reference, status: TransactionStatus.success },
    });
    if (alreadyProcessed) return;

    const transaction = await this.prisma.transaction.findFirst({
      where: { paystackReference: reference },
      include: { wallet: true },
    });
    if (!transaction) return;

    // amountAdded is Parats (stored at initiation time from server-side package config)
    const parats = Number(transaction.amountAdded);
    const newBalance = Number(transaction.wallet.balance) + parats;

    await this.prisma.$transaction([
      this.prisma.wallet.update({
        where: { walletId: transaction.walletId },
        data: { balance: newBalance },
      }),
      this.prisma.transaction.update({
        where: { transactionId: transaction.transactionId },
        data: { status: TransactionStatus.success, balanceAfter: newBalance },
      }),
      this.prisma.notification.create({
        data: {
          userId: transaction.userId,
          type: NotificationType.wallet_topup,
          title: 'Wallet Topped Up',
          body: `${parats} Parats have been added to your wallet. New balance: ${newBalance} Parats.`,
          metadata: { reference, parats, packageId: metadata?.packageId },
        },
      }),
    ]);
  }
}
