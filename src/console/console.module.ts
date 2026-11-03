import { Module } from '@nestjs/common';
import { ConsoleController } from './console.controller';
import { ConsoleService } from './console.service';
import { ConsoleTokenGuard } from './console-token.guard';

/** Read-only API for the Parakletus admin console (admin.parakletushub.com). */
@Module({
  controllers: [ConsoleController],
  providers: [ConsoleService, ConsoleTokenGuard],
})
export class ConsoleModule {}
