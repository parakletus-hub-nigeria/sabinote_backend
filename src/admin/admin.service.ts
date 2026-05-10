import { Injectable, NotFoundException } from '@nestjs/common';
import { NotificationType, TransactionPurpose, TransactionStatus, TransactionType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CurriculumService } from '../curriculum/curriculum.service';
import { SeedCurriculumDto } from '../curriculum/dto/seed-curriculum.dto';
import { ResourcesService } from '../resources/resources.service';
import { CreditWalletDto } from './dto/credit-wallet.dto';

@Injectable()
export class AdminService {
  constructor(
    private prisma: PrismaService,
    private curriculumService: CurriculumService,
    private resourcesService: ResourcesService,
  ) {}

  async getUsers(page: number, limit: number) {
    const [users, total] = await Promise.all([
      this.prisma.user.findMany({
        select: {
          userId: true, firstName: true, lastName: true, email: true,
          state: true, role: true, isVerified: true, createdAt: true,
          wallet: { select: { balance: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.user.count(),
    ]);
    return { users, pagination: { page, limit, total } };
  }

  async getStats() {
    const [totalUsers, totalNotes, totalTransactions, revenueAgg] = await Promise.all([
      this.prisma.user.count(),
      this.prisma.lessonNote.count(),
      this.prisma.transaction.count({ where: { type: TransactionType.credit, status: TransactionStatus.success } }),
      this.prisma.transaction.aggregate({
        where: { type: TransactionType.credit, status: TransactionStatus.success },
        _sum: { amountAdded: true },
      }),
    ]);

    const notesThisMonth = await this.prisma.lessonNote.count({
      where: { createdAt: { gte: new Date(new Date().setDate(1)) } },
    });

    return {
      totalUsers,
      totalNotes,
      notesThisMonth,
      totalTopups: totalTransactions,
      totalRevenueNGN: revenueAgg._sum.amountAdded ?? 0,
    };
  }

  async creditWallet(dto: CreditWalletDto) {
    const wallet = await this.prisma.wallet.findUnique({ where: { userId: dto.userId } });
    if (!wallet) throw new NotFoundException('Wallet not found');

    const newBalance = Number(wallet.balance) + dto.amount;
    await this.prisma.$transaction([
      this.prisma.wallet.update({ where: { userId: dto.userId }, data: { balance: newBalance } }),
      this.prisma.transaction.create({
        data: {
          walletId: wallet.walletId,
          userId: dto.userId,
          type: TransactionType.credit,
          amountAdded: dto.amount,
          balanceBefore: wallet.balance,
          balanceAfter: newBalance,
          purpose: TransactionPurpose.topup,
          status: TransactionStatus.success,
          description: `Admin credit: ${dto.reason}`,
        },
      }),
      this.prisma.notification.create({
        data: {
          userId: dto.userId,
          type: NotificationType.wallet_topup,
          title: 'Wallet Credited',
          body: `Your wallet has been credited with ${dto.amount} Parats by admin. Reason: ${dto.reason}`,
        },
      }),
    ]);

    return { newBalance };
  }

  async getTransactions(page: number, limit: number) {
    const [transactions, total] = await Promise.all([
      this.prisma.transaction.findMany({
        include: { user: { select: { email: true, firstName: true, lastName: true } } },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.transaction.count(),
    ]);
    return { transactions, pagination: { page, limit, total } };
  }

  seedCurriculum(dto: SeedCurriculumDto) {
    return this.curriculumService.seed(dto);
  }

  uploadPublicResource(adminId: string, file: Express.Multer.File, body: any) {
    return this.resourcesService.upload(adminId, file, body, true);
  }
}
