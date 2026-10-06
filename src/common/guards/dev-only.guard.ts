import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class DevOnlyGuard implements CanActivate {
  constructor(private configService: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const isProduction =
      this.configService.get<string>('NODE_ENV') === 'production';
    const allowManual =
      this.configService.get<boolean>('ALLOW_MANUAL_TOPUP') === true;

    if (isProduction || !allowManual) {
      throw new ForbiddenException(
        'Manual top-up is disabled in this environment (ARCH-011)',
      );
    }

    return true;
  }
}
