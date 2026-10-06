import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { AuthService } from './auth.service';
import { PrismaService } from '../prisma/prisma.service';

describe('AuthService Session Management (ARCH-005)', () => {
  let service: AuthService;
  let prisma: Partial<PrismaService>;
  let jwtService: Partial<JwtService>;
  let configService: Partial<ConfigService>;

  beforeEach(() => {
    jwtService = {
      sign: jest.fn().mockReturnValue('mock-jwt-token'),
    };
    configService = {
      getOrThrow: jest.fn().mockReturnValue('test-secret-at-least-16-chars-long'),
      get: jest.fn().mockReturnValue('15m'),
    };
    prisma = {
      refreshSession: {
        create: jest.fn().mockResolvedValue({ sessionId: 'sess-1' }),
        findUnique: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
      } as any,
      user: {
        findUnique: jest.fn().mockResolvedValue({
          userId: 'user-1',
          email: 'test@sabinote.com',
          role: 'teacher',
        }),
      } as any,
      $transaction: jest.fn().mockImplementation((promises) => Promise.all(promises)),
    };

    service = new AuthService(
      prisma as PrismaService,
      jwtService as JwtService,
      configService as ConfigService,
    );
  });

  it('should rotate session successfully when a valid refresh token is presented', async () => {
    (prisma.refreshSession.findUnique as jest.Mock).mockResolvedValue({
      sessionId: 'sess-1',
      userId: 'user-1',
      familyId: 'family-1',
      isRevoked: false,
      expiresAt: new Date(Date.now() + 1000000),
    });

    const tokens = await service.rotateSession('user-1', 'valid-refresh-token');

    expect(tokens.accessToken).toBe('mock-jwt-token');
    expect(tokens.refreshToken).toBe('mock-jwt-token');
    expect(prisma.refreshSession.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { sessionId: 'sess-1' },
        data: expect.objectContaining({
          isRevoked: true,
          revokedReason: 'rotated',
        }),
      }),
    );
    expect(prisma.refreshSession.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          familyId: 'family-1',
        }),
      }),
    );
  });

  it('should detect refresh token reuse and revoke the entire token family (ARCH-005)', async () => {
    (prisma.refreshSession.findUnique as jest.Mock).mockResolvedValue({
      sessionId: 'sess-compromised',
      userId: 'user-1',
      familyId: 'family-stolen',
      isRevoked: true,
      revokedReason: 'rotated',
      expiresAt: new Date(Date.now() + 1000000),
    });

    await expect(
      service.rotateSession('user-1', 'already-used-refresh-token'),
    ).rejects.toThrow(UnauthorizedException);

    expect(prisma.refreshSession.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { familyId: 'family-stolen' },
        data: expect.objectContaining({
          isRevoked: true,
          revokedReason: 'reuse_detected',
        }),
      }),
    );
  });

  it('should revoke sessions on logout', async () => {
    await service.logout('user-1', 'token-to-logout');

    expect(prisma.refreshSession.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          userId: 'user-1',
        }),
        data: expect.objectContaining({
          isRevoked: true,
          revokedReason: 'user_logout',
        }),
      }),
    );
  });
});
