import { GUARDS_METADATA } from '@nestjs/common/constants';
import { AdminGuard } from './admin/admin.guard';
import { AppController } from './app.controller';
import { JwtAuthGuard } from './auth/guards/jwt-auth.guard';

describe('AppController access', () => {
  it('limits GET /system/ai-health to admins', () => {
    // It spends OpenRouter credit on any model a caller names; it must never be public.
    const guards = Reflect.getMetadata(GUARDS_METADATA, AppController.prototype.getAiHealth);
    expect(guards).toEqual([JwtAuthGuard, AdminGuard]);
  });

  it('keeps GET /health public', () => {
    expect(Reflect.getMetadata(GUARDS_METADATA, AppController.prototype.getHealth)).toBeUndefined();
  });
});
