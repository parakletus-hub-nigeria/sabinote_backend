import { Injectable } from '@nestjs/common';
import { TransactionPurpose, TransactionStatus, TransactionType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

const DAY_MS = 24 * 60 * 60 * 1000;

/** How a successful top-up was paid for, from what WalletService/AdminService record. */
export type TopupSource = 'paystack' | 'manual' | 'admin';

export function topupSource(paystackReference: string | null): TopupSource {
  if (!paystackReference) return 'admin'; // AdminService.creditWallet sets no reference
  return paystackReference.startsWith('manual_') ? 'manual' : 'paystack';
}

/**
 * Read-only numbers for the Parakletus admin console. Explicit selects only:
 * no password hashes, tokens or raw Paystack payloads leave this service.
 */
@Injectable()
export class ConsoleService {
  constructor(private readonly prisma: PrismaService) {}

  async summary() {
    const since30d = new Date(Date.now() - 30 * DAY_MS);
    const successfulTopup = {
      type: TransactionType.credit,
      purpose: TransactionPurpose.topup,
      status: TransactionStatus.success,
    };

    const [users, verifiedUsers, newUsers30d, notes, notes30d, failedTx30d, topups30d] = await Promise.all([
      this.prisma.user.count(),
      this.prisma.user.count({ where: { isVerified: true } }),
      this.prisma.user.count({ where: { createdAt: { gte: since30d } } }),
      this.prisma.lessonNote.count(),
      this.prisma.lessonNote.count({ where: { createdAt: { gte: since30d } } }),
      this.prisma.transaction.count({ where: { status: TransactionStatus.failed, createdAt: { gte: since30d } } }),
      this.prisma.transaction.findMany({
        where: { ...successfulTopup, createdAt: { gte: since30d } },
        select: { paystackReference: true, amountAdded: true },
      }),
    ]);

    const bySource: Record<TopupSource, { count: number; parats: number }> = {
      paystack: { count: 0, parats: 0 },
      manual: { count: 0, parats: 0 },
      admin: { count: 0, parats: 0 },
    };
    for (const t of topups30d) {
      const s = bySource[topupSource(t.paystackReference)];
      s.count += 1;
      s.parats += Number(t.amountAdded);
    }

    return {
      users: { total: users, verified: verifiedUsers, new30d: newUsers30d },
      lessonNotes: { total: notes, last30d: notes30d },
      topups30d: bySource,
      failedTransactions30d: failedTx30d,
      generatedAt: new Date().toISOString(),
    };
  }

  async users(page: number, limit: number, search?: string) {
    const where = search
      ? {
          OR: [
            { email: { contains: search, mode: 'insensitive' as const } },
            { firstName: { contains: search, mode: 'insensitive' as const } },
            { lastName: { contains: search, mode: 'insensitive' as const } },
          ],
        }
      : {};
    const [rows, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        select: {
          userId: true,
          firstName: true,
          lastName: true,
          email: true,
          state: true,
          role: true,
          isVerified: true,
          createdAt: true,
          wallet: { select: { balance: true } },
          _count: { select: { lessonNotes: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.user.count({ where }),
    ]);

    const users = rows.map(({ wallet, _count, ...u }) => ({
      ...u,
      balance: wallet ? Number(wallet.balance) : 0,
      lessonNotes: _count.lessonNotes,
    }));
    return { users, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } };
  }

  async transactions(page: number, limit: number) {
    const [rows, total] = await Promise.all([
      this.prisma.transaction.findMany({
        select: {
          transactionId: true,
          type: true,
          purpose: true,
          status: true,
          amountAdded: true,
          amountDeducted: true,
          paystackReference: true,
          createdAt: true,
          user: { select: { email: true, firstName: true, lastName: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.transaction.count(),
    ]);

    const transactions = rows.map(({ amountAdded, amountDeducted, paystackReference, ...t }) => ({
      ...t,
      amount: Number(amountAdded) - Number(amountDeducted),
      source: t.type === TransactionType.credit && t.purpose === TransactionPurpose.topup ? topupSource(paystackReference) : null,
    }));
    return { transactions, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } };
  }
}
