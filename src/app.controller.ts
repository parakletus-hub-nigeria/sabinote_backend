import { Controller, Get } from '@nestjs/common';
import { AppService } from './app.service';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  getRoot() {
    return {
      success: true,
      data: {
        name: 'SabiNote API',
        version: 'v2.0.0-baseline',
        status: 'healthy',
        timestamp: new Date().toISOString(),
      },
    };
  }

  @Get('health')
  getHealth() {
    return {
      status: 'ok',
      version: 'v2.0.0-baseline',
      environment: process.env.NODE_ENV || 'development',
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
    };
  }
}
