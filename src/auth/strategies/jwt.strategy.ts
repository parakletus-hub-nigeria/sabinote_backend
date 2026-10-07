import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { PrismaService } from '../../prisma/prisma.service';
import { CacheService } from '../../cache/cache.service';

export interface JwtPayload {
  sub: string;
  email: string;
  role: string;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(
    configService: ConfigService,
    private prisma: PrismaService,
    private cache: CacheService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.getOrThrow<string>('JWT_SECRET'),
    });
  }

  async validate(payload: JwtPayload) {
    // Runs on every authenticated request — cache briefly to skip a DB round trip.
    // Invalidated by UsersService on profile change / account deletion.
    const user = await this.cache.wrap(
      `auth:user:${payload.sub}`,
      () =>
        this.prisma.user.findUnique({
          where: { userId: payload.sub },
          select: { userId: true, email: true, role: true, isVerified: true },
        }),
      60_000,
    );

    if (!user) throw new UnauthorizedException();

    return user;
  }
}
