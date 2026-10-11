import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  NotificationType,
  TransactionPurpose,
  TransactionStatus,
  TransactionType,
} from '@prisma/client';
import axios from 'axios';
import * as crypto from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { InitiateTopupDto } from './dto/initiate-topup.dto';

export interface ParatsPackage {
  id: string;
  parats: number;
  priceNGN: number;
}

@Injectable()
export class WalletService {
  private readonly logger = new Logger(WalletService.name);
  private paystackBase = 'https://api.paystack.co';
  private packages: ParatsPackage[];

  constructor(
    private prisma: PrismaService,
    private config: ConfigService,
    private notifications: NotificationsService,
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
    let wallet = await this.prisma.wallet.findUnique({ where: { userId } });
    if (!wallet) {
      const user = await this.prisma.user.findUnique({ where: { userId } });
      if (!user) throw new NotFoundException('User not found');
      wallet = await this.prisma.wallet.create({
        data: {
          userId,
          balance: 24.0,
        },
      });
    }
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
    if (!pkg)
      throw new BadRequestException(`Unknown package: ${dto.packageId}`);

    const user = await this.prisma.user.findUnique({
      where: { userId },
      select: { email: true },
    });
    if (!user) throw new NotFoundException('User not found');

    let wallet = await this.prisma.wallet.findUnique({ where: { userId } });
    if (!wallet) {
      wallet = await this.prisma.wallet.create({
        data: {
          userId,
          balance: 24.0,
        },
      });
    }

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

    // The frontend opens Paystack's Inline popup with this reference directly —
    // no server-side /transaction/initialize call or callback URL required, so
    // there's nothing here that depends on deploy-time config being correct.
    return {
      email: user.email,
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

    let response: any;
    try {
      response = await axios.get(
        `${this.paystackBase}/transaction/verify/${reference}`,
        {
          headers: {
            Authorization: `Bearer ${this.config.getOrThrow('PAYSTACK_SECRET_KEY')}`,
          },
          timeout: 15_000,
        },
      );
    } catch (err: any) {
      const paystackMsg = err?.response?.data?.message ?? err?.message ?? 'Paystack error';
      const paystackStatus = err?.response?.status;
      throw new BadRequestException(`Payment verification failed (${paystackStatus}): ${paystackMsg}`);
    }

    const payment = response.data.data;
    if (payment.status !== 'success') {
      if (payment.status === 'failed' || payment.status === 'abandoned') {
        await this.prisma.transaction.updateMany({
          where: { paystackReference: reference, status: TransactionStatus.pending },
          data: { status: TransactionStatus.failed },
        });
      }
      throw new BadRequestException('Payment not yet successful');
    }

    const credited = await this.creditWallet(
      reference,
      payment.metadata,
      Number(payment.amount),
    );
    return { credited, reference };
  }

  async handleWebhook(rawBody: Buffer, signature: string) {
    if (!rawBody || !signature) return;

    // Paystack signs webhooks with the account's secret key. PAYSTACK_WEBHOOK_SECRET
    // is accepted as well in case a dedicated value was configured.
    const secrets = [
      this.config.getOrThrow<string>('PAYSTACK_SECRET_KEY'),
      this.config.get<string>('PAYSTACK_WEBHOOK_SECRET'),
    ].filter((s): s is string => !!s);

    const valid = secrets.some((secret) => {
      const hash = crypto.createHmac('sha512', secret).update(rawBody).digest('hex');
      const a = Buffer.from(hash);
      const b = Buffer.from(signature);
      return a.length === b.length && crypto.timingSafeEqual(a, b);
    });
    if (!valid) return; // silently ignore invalid signatures

    const event = JSON.parse(rawBody.toString());
    if (event.event === 'charge.success') {
      const { reference, metadata, amount } = event.data;
      try {
        await this.creditWallet(reference, metadata, Number(amount));
      } catch (err) {
        // Acknowledge the webhook anyway — a 4xx would make Paystack retry forever
        this.logger.error(`Webhook credit failed for ${reference}: ${String(err)}`);
      }
    }
  }

  /**
   * Credits the wallet for a confirmed payment. Returns true when this call
   * performed the credit (or it had already been credited), false when the
   * reference is unknown. `paidKobo` is the amount Paystack actually collected.
   */
  private async creditWallet(
    reference: string,
    metadata: any,
    paidKobo?: number,
  ): Promise<boolean> {
    const transaction = await this.prisma.transaction.findFirst({
      where: { paystackReference: reference },
    });
    if (!transaction) return false;
    if (transaction.status === TransactionStatus.success) return true;

    // amountAdded is Parats (stored at initiation time from server-side package config)
    const parats = Number(transaction.amountAdded);

    // Never credit a payment that is smaller than the package price
    const pkg = this.packages.find((p) => p.parats === parats);
    if (pkg && paidKobo !== undefined && paidKobo < pkg.priceNGN * 100) {
      throw new BadRequestException('Amount paid does not match the package price');
    }

    // The status flip and the balance increment share one DB transaction, and the
    // flip only matches a still-pending row — so a webhook and a verify call racing
    // each other can never both credit.
    const newBalance = await this.prisma.$transaction(async (tx) => {
      const claimed = await tx.transaction.updateMany({
        where: {
          transactionId: transaction.transactionId,
          status: { not: TransactionStatus.success },
        },
        data: { status: TransactionStatus.success },
      });
      if (claimed.count === 0) return null;

      const wallet = await tx.wallet.update({
        where: { walletId: transaction.walletId },
        data: { balance: { increment: parats } },
      });
      await tx.transaction.update({
        where: { transactionId: transaction.transactionId },
        data: {
          balanceBefore: Number(wallet.balance) - parats,
          balanceAfter: wallet.balance,
        },
      });
      return Number(wallet.balance);
    });

    if (newBalance !== null) {
      await this.notifications.notify(transaction.userId, NotificationType.wallet_topup, {
        title: 'Wallet Topped Up',
        body: `${parats} Parats have been added to your wallet. New balance: ${newBalance} Parats.`,
        metadata: { reference, parats, packageId: metadata?.packageId ?? pkg?.id },
      });
    }
    return true;
  }

  // TODO: TEMPORARY — Remove this method when Paystack is fully integrated
  async manualTopup(userId: string, dto: InitiateTopupDto) {
    const pkg = this.packages.find((p) => p.id === dto.packageId);
    if (!pkg)
      throw new BadRequestException(`Unknown package: ${dto.packageId}`);

    const user = await this.prisma.user.findUnique({ where: { userId } });
    if (!user) throw new NotFoundException('User not found');

    const wallet = await this.getBalance(userId);

    const reference = `manual_${Date.now()}_${userId.slice(0, 8)}`;
    const parats = pkg.parats;
    const newBalance = Number(wallet.balance) + parats;

    await this.prisma.$transaction([
      this.prisma.wallet.update({
        where: { walletId: wallet.walletId },
        data: { balance: newBalance },
      }),
      this.prisma.transaction.create({
        data: {
          walletId: wallet.walletId,
          userId,
          type: TransactionType.credit,
          amountAdded: parats,
          balanceBefore: wallet.balance,
          balanceAfter: newBalance,
          purpose: TransactionPurpose.topup,
          paystackReference: reference,
          description: `Manual top up ${parats} Parats [DEV ONLY]`,
          status: TransactionStatus.success,
        },
      }),
    ]);

    await this.notifications.notify(userId, NotificationType.wallet_topup, {
      title: 'Wallet Topped Up',
      body: `${parats} Parats have been added to your wallet. New balance: ${newBalance} Parats.`,
      metadata: { reference, parats, packageId: pkg.id },
    });

    return {
      success: true,
      reference,
      newBalance,
      parats,
      package: pkg,
    };
  }
}
