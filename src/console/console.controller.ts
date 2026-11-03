import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { ConsoleTokenGuard } from './console-token.guard';
import { ConsoleService } from './console.service';

function clampInt(raw: string | undefined, fallback: number, min: number, max: number): number {
  const n = Number.parseInt(raw ?? '', 10);
  return Number.isFinite(n) ? Math.min(Math.max(n, min), max) : fallback;
}

/**
 * Read-only API for the Parakletus admin console. GET only; authenticated by
 * the x-console-token header (see ConsoleTokenGuard), not by user JWTs.
 */
@ApiExcludeController()
@Controller('console')
@UseGuards(ConsoleTokenGuard)
export class ConsoleController {
  constructor(private readonly consoleService: ConsoleService) {}

  @Get('summary')
  async summary() {
    return { success: true, data: await this.consoleService.summary() };
  }

  @Get('users')
  async users(@Query('page') page?: string, @Query('limit') limit?: string, @Query('search') search?: string) {
    return {
      success: true,
      data: await this.consoleService.users(
        clampInt(page, 1, 1, 10_000),
        clampInt(limit, 25, 1, 50),
        search?.trim().slice(0, 100) || undefined,
      ),
    };
  }

  @Get('transactions')
  async transactions(@Query('page') page?: string, @Query('limit') limit?: string) {
    return {
      success: true,
      data: await this.consoleService.transactions(clampInt(page, 1, 1, 10_000), clampInt(limit, 25, 1, 50)),
    };
  }
}
