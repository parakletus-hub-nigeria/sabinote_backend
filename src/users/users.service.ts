import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
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
    },
  },
};

@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService) {}

  async getProfile(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { userId }, select: USER_SELECT });
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  async updateProfile(userId: string, dto: UpdateProfileDto) {
    return this.prisma.user.update({
      where: { userId },
      data: dto,
      select: USER_SELECT,
    });
  }

  async getSettings(userId: string) {
    const settings = await this.prisma.userSettings.findUnique({ where: { userId } });
    if (!settings) throw new NotFoundException('Settings not found');
    return settings;
  }

  async updateSettings(userId: string, dto: UpdateSettingsDto) {
    return this.prisma.userSettings.update({ where: { userId }, data: dto });
  }

  async deleteAccount(userId: string) {
    await this.prisma.user.delete({ where: { userId } });
  }
}
