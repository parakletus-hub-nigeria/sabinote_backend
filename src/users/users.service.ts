import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { v2 as cloudinary } from 'cloudinary';
import { PrismaService } from '../prisma/prisma.service';
import { CacheService } from '../cache/cache.service';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { UpdateSettingsDto } from './dto/update-settings.dto';

const USER_SELECT = {
  userId: true, firstName: true, lastName: true, email: true,
  phoneNumber: true, state: true, role: true, isVerified: true, createdAt: true,
  wallet: { select: { walletId: true, balance: true } },
  settings: {
    select: {
      defaultState: true, noteDifficultyLevel: true, defaultSubject: true,
      defaultClassLevel: true, emailNotifications: true, alwaysConfirmState: true,
      notifyGenerationComplete: true, notifyWalletTopup: true,
    },
  },
};

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

  constructor(
    private prisma: PrismaService,
    private cache: CacheService,
  ) {}

  private async invalidateUserCache(userId: string) {
    await Promise.all([
      this.cache.del(`auth:user:${userId}`),
      this.cache.del(`user:settings:${userId}`),
    ]);
  }

  async getProfile(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { userId }, select: USER_SELECT });
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  async updateProfile(userId: string, dto: UpdateProfileDto) {
    const user = await this.prisma.user.update({
      where: { userId },
      data: dto,
      select: USER_SELECT,
    });
    await this.invalidateUserCache(userId);
    return user;
  }

  async getSettings(userId: string) {
    // Accounts created before settings existed won't have a row yet
    return this.prisma.userSettings.upsert({ where: { userId }, update: {}, create: { userId } });
  }

  async updateSettings(userId: string, dto: UpdateSettingsDto) {
    const settings = await this.prisma.userSettings.upsert({
      where: { userId },
      update: dto,
      create: { userId, ...dto },
    });
    await this.invalidateUserCache(userId);
    return settings;
  }

  async deleteAccount(userId: string, password?: string) {
    const user = await this.prisma.user.findUnique({
      where: { userId },
      select: { passwordHash: true },
    });
    if (!user) throw new NotFoundException('User not found');

    if (user.passwordHash) {
      if (!password || !(await bcrypt.compare(password, user.passwordHash))) {
        throw new BadRequestException('Password is incorrect');
      }
    }

    const files = await this.prisma.userResource.findMany({
      where: { userId, fileKey: { not: null } },
      select: { fileKey: true },
    });

    // Most relations have no ON DELETE CASCADE, so clear the user's data in
    // dependency order — a bare user.delete() fails on the foreign keys.
    await this.prisma.$transaction([
      this.prisma.userPrompt.deleteMany({ where: { userId } }),
      this.prisma.lessonNote.deleteMany({ where: { userId } }),
      this.prisma.notification.deleteMany({ where: { userId } }),
      this.prisma.transaction.deleteMany({ where: { userId } }),
      // Notes by other users that point at this user's resources
      this.prisma.lessonNote.updateMany({
        where: { resource: { userId } },
        data: { resourceId: null },
      }),
      this.prisma.userResource.updateMany({
        where: { uploadedBy: userId, NOT: { userId } },
        data: { uploadedBy: null },
      }),
      this.prisma.userResource.deleteMany({ where: { userId } }),
      this.prisma.user.delete({ where: { userId } }), // wallet, settings, sessions cascade
    ]);
    await this.invalidateUserCache(userId);

    // Storage cleanup is best-effort; the account is already gone
    await Promise.all(
      files.map((f) =>
        cloudinary.uploader.destroy(f.fileKey!, { resource_type: 'raw' }).catch((err) =>
          this.logger.warn(`Could not remove ${f.fileKey}: ${err?.message}`),
        ),
      ),
    );
  }
}
