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

  async register(dto: RegisterDto) {
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

    return {
      user,
      wallet: user.wallet,
      ...tokens,
    };
  }

  async login(dto: LoginDto) {
    const user = await this.validateCredentials(dto.email, dto.password);

    if (!user) {
      throw new UnauthorizedException('Invalid email or password');
    }

    const tokens = this.generateTokens(user.userId, user.email, user.role);

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

  async refreshTokens(userId: string, email: string, role: Role) {
    const user = await this.prisma.user.findUnique({
      where: { userId },
      select: { userId: true, email: true, role: true },
    });

    if (!user) throw new UnauthorizedException();

    return this.generateTokens(user.userId, user.email, user.role);
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
