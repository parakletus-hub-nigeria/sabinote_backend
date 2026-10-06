import { ForbiddenException, ExecutionContext } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DevOnlyGuard } from './dev-only.guard';

describe('DevOnlyGuard (ARCH-011)', () => {
  let guard: DevOnlyGuard;
  let configService: Partial<ConfigService>;
  const mockContext = {} as ExecutionContext;

  it('should allow access in development when ALLOW_MANUAL_TOPUP is true', () => {
    configService = {
      get: jest.fn((key: string) => {
        if (key === 'NODE_ENV') return 'development';
        if (key === 'ALLOW_MANUAL_TOPUP') return true;
        return undefined;
      }),
    };
    guard = new DevOnlyGuard(configService as ConfigService);
    expect(guard.canActivate(mockContext)).toBe(true);
  });

  it('should throw ForbiddenException if NODE_ENV is production', () => {
    configService = {
      get: jest.fn((key: string) => {
        if (key === 'NODE_ENV') return 'production';
        if (key === 'ALLOW_MANUAL_TOPUP') return true;
        return undefined;
      }),
    };
    guard = new DevOnlyGuard(configService as ConfigService);
    expect(() => guard.canActivate(mockContext)).toThrow(ForbiddenException);
  });

  it('should throw ForbiddenException if ALLOW_MANUAL_TOPUP is false', () => {
    configService = {
      get: jest.fn((key: string) => {
        if (key === 'NODE_ENV') return 'development';
        if (key === 'ALLOW_MANUAL_TOPUP') return false;
        return undefined;
      }),
    };
    guard = new DevOnlyGuard(configService as ConfigService);
    expect(() => guard.canActivate(mockContext)).toThrow(ForbiddenException);
  });
});
