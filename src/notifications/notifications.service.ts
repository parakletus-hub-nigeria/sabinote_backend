import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { NotificationType, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(private prisma: PrismaService) {}

  /**
   * Creates an in-app notification unless the user has switched that category off.
   * Best-effort: a failure here must never break the action that triggered it.
   */
  async notify(
    userId: string,
    type: NotificationType,
    content: { title: string; body: string; metadata?: Prisma.InputJsonValue },
  ) {
    try {
      const settings = await this.prisma.userSettings.findUnique({
        where: { userId },
        select: { notifyGenerationComplete: true, notifyWalletTopup: true },
      });
      if (settings) {
        if (
          (type === NotificationType.generation_complete ||
            type === NotificationType.generation_failed) &&
          !settings.notifyGenerationComplete
        ) {
          return;
        }
        if (type === NotificationType.wallet_topup && !settings.notifyWalletTopup) {
          return;
        }
      }
      await this.prisma.notification.create({ data: { userId, type, ...content } });
    } catch (err) {
      this.logger.warn(`Failed to create ${type} notification for ${userId}: ${String(err)}`);
    }
  }

  async unreadCount(userId: string) {
    return this.prisma.notification.count({ where: { userId, isRead: false } });
  }

  async getAll(userId: string, page: number, limit: number) {
    page = Number.isInteger(page) && page > 0 ? page : 1;
    limit = Number.isInteger(limit) && limit > 0 ? Math.min(limit, 100) : 20;
    const [notifications, total] = await Promise.all([
      this.prisma.notification.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.notification.count({ where: { userId } }),
    ]);
    return { notifications, pagination: { page, limit, total } };
  }

  async markRead(userId: string, notificationId: string) {
    const n = await this.prisma.notification.findUnique({ where: { notificationId } });
    if (!n || n.userId !== userId) throw new NotFoundException();
    return this.prisma.notification.update({ where: { notificationId }, data: { isRead: true } });
  }

  async markAllRead(userId: string) {
    await this.prisma.notification.updateMany({ where: { userId, isRead: false }, data: { isRead: true } });
  }
}
