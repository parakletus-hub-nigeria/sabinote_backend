import {
  BadRequestException,
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Role } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { createHash, randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
    private configService: ConfigService,
  ) {}

  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  async createSession(
    userId: string,
    refreshToken: string,
    meta?: { userAgent?: string; ipAddress?: string },
  ) {
    const tokenHash = this.hashToken(refreshToken);
    const familyId = randomUUID();
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

    return this.prisma.refreshSession.create({
      data: {
        userId,
        tokenHash,
        familyId,
        userAgent: meta?.userAgent,
        ipAddress: meta?.ipAddress,
        expiresAt,
      },
    });
  }

  async rotateSession(
    userId: string,
    oldRefreshToken: string,
    meta?: { userAgent?: string; ipAddress?: string },
  ) {
    const oldHash = this.hashToken(oldRefreshToken);
    const existing = await this.prisma.refreshSession.findUnique({
      where: { tokenHash: oldHash },
    });

    if (!existing) {
      // Fall back to issuing a new session if old token wasn't tracked yet (legacy migration)
      const user = await this.prisma.user.findUnique({
        where: { userId },
        select: { userId: true, email: true, role: true },
      });
      if (!user) throw new UnauthorizedException('User not found');
      const tokens = this.generateTokens(user.userId, user.email, user.role);
      await this.createSession(user.userId, tokens.refreshToken, meta);
      return tokens;
    }

    if (existing.isRevoked) {
      // ARCH-005: Reuse detected! Compromised token family — revoke entire family
      await this.prisma.refreshSession.updateMany({
        where: { familyId: existing.familyId },
        data: {
          isRevoked: true,
          revokedAt: new Date(),
          revokedReason: 'reuse_detected',
        },
      });
      throw new UnauthorizedException(
        'Refresh token reuse detected; all sessions revoked for security (ARCH-005)',
      );
    }

    if (existing.expiresAt < new Date()) {
      throw new UnauthorizedException('Refresh session has expired');
    }

    const user = await this.prisma.user.findUnique({
      where: { userId },
      select: { userId: true, email: true, role: true },
    });
    if (!user) throw new UnauthorizedException('User not found');

    const tokens = this.generateTokens(user.userId, user.email, user.role);
    const newHash = this.hashToken(tokens.refreshToken);
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    await this.prisma.$transaction([
      this.prisma.refreshSession.update({
        where: { sessionId: existing.sessionId },
        data: {
          isRevoked: true,
          revokedAt: new Date(),
          revokedReason: 'rotated',
        },
      }),
      this.prisma.refreshSession.create({
        data: {
          userId: user.userId,
          tokenHash: newHash,
          familyId: existing.familyId,
          userAgent: meta?.userAgent || existing.userAgent,
          ipAddress: meta?.ipAddress || existing.ipAddress,
          expiresAt,
        },
      }),
    ]);

    return tokens;
  }

  async logout(userId: string, refreshToken?: string) {
    if (refreshToken) {
      const tokenHash = this.hashToken(refreshToken);
      await this.prisma.refreshSession.updateMany({
        where: { tokenHash, userId },
        data: {
          isRevoked: true,
          revokedAt: new Date(),
          revokedReason: 'user_logout',
        },
      });
    } else {
      await this.prisma.refreshSession.updateMany({
        where: { userId, isRevoked: false },
        data: {
          isRevoked: true,
          revokedAt: new Date(),
          revokedReason: 'user_logout_all',
        },
      });
    }
  }

  async register(
    dto: RegisterDto,
    meta?: { userAgent?: string; ipAddress?: string },
  ) {
    const existing = await this.prisma.user.findUnique({
      where: { email: dto.email.toLowerCase() },
    });

    if (existing) {
      throw new ConflictException('An account with this email already exists');
    }

    const passwordHash = await bcrypt.hash(dto.password, 12);

    const user = await this.prisma.user.create({
      data: {
        firstName: dto.firstName,
        lastName: dto.lastName,
        email: dto.email.toLowerCase(),
        passwordHash,
        phoneNumber: dto.phoneNumber,
        state: dto.state,
        role: Role.teacher,
        wallet: {
          create: { balance: 0 },
        },
        settings: {
          create: {
            defaultState: dto.state,
          },
        },
      },
      select: {
        userId: true,
        firstName: true,
        lastName: true,
        email: true,
        state: true,
        role: true,
        isVerified: true,
        createdAt: true,
        wallet: {
          select: { walletId: true, balance: true },
        },
      },
    });

    const tokens = this.generateTokens(user.userId, user.email, user.role);
    await this.createSession(user.userId, tokens.refreshToken, meta);

    return {
      user,
      wallet: user.wallet,
      ...tokens,
    };
  }

  async login(
    dto: LoginDto,
    meta?: { userAgent?: string; ipAddress?: string },
  ) {
    const user = await this.validateCredentials(dto.email, dto.password);

    if (!user) {
      throw new UnauthorizedException('Invalid email or password');
    }

    const tokens = this.generateTokens(user.userId, user.email, user.role);
    await this.createSession(user.userId, tokens.refreshToken, meta);

    return {
      user: {
        userId: user.userId,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        state: user.state,
        role: user.role,
        isVerified: user.isVerified,
      },
      ...tokens,
    };
  }

  async validateCredentials(email: string, password: string) {
    const user = await this.prisma.user.findUnique({
      where: { email: email.toLowerCase() },
    });

    if (!user || !user.passwordHash) return null;

    const isMatch = await bcrypt.compare(password, user.passwordHash);
    if (!isMatch) return null;

    return user;
  }

  async refreshTokens(
    userId: string,
    refreshToken?: string,
    meta?: { userAgent?: string; ipAddress?: string },
  ) {
    if (refreshToken) {
      return this.rotateSession(userId, refreshToken, meta);
    }

    const user = await this.prisma.user.findUnique({
      where: { userId },
      select: { userId: true, email: true, role: true },
    });

    if (!user) throw new UnauthorizedException();

    const tokens = this.generateTokens(user.userId, user.email, user.role);
    await this.createSession(user.userId, tokens.refreshToken, meta);
    return tokens;
  }

  async getMe(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { userId },
      select: {
        userId: true,
        firstName: true,
        lastName: true,
        email: true,
        phoneNumber: true,
        state: true,
        role: true,
        isVerified: true,
        createdAt: true,
        wallet: {
          select: { walletId: true, balance: true },
        },
        settings: {
          select: {
            defaultState: true,
            noteDifficultyLevel: true,
            defaultSubject: true,
            defaultClassLevel: true,
            emailNotifications: true,
            alwaysConfirmState: true,
          },
        },
      },
    });

    if (!user) throw new UnauthorizedException();

    return user;
  }

  private generateTokens(userId: string, email: string, role: Role) {
    const payload = { sub: userId, email, role };

    const accessToken = this.jwtService.sign(payload, {
      secret: this.configService.getOrThrow('JWT_SECRET'),
      expiresIn: this.configService.get('JWT_EXPIRES_IN', '15m'),
    });

    const refreshToken = this.jwtService.sign(payload, {
      secret: this.configService.getOrThrow('JWT_REFRESH_SECRET'),
      expiresIn: this.configService.get('JWT_REFRESH_EXPIRES_IN', '7d'),
    });

    return { accessToken, refreshToken };
  }
}
