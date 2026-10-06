import { Controller, Get } from '@nestjs/common';
import { AppService } from './app.service';
import { PLATFORM_RELEASE_MANIFEST } from './common/config/release.manifest';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  getRoot() {
    return {
      success: true,
      data: {
        name: 'SabiNote API',
        version: PLATFORM_RELEASE_MANIFEST.current.versionTag,
        codename: PLATFORM_RELEASE_MANIFEST.current.codename,
        curriculumBaseline: PLATFORM_RELEASE_MANIFEST.current.curriculumBaseline.tag,
        status: 'healthy',
        timestamp: new Date().toISOString(),
      },
    };
  }

  @Get('health')
  getHealth() {
    return {
      status: 'ok',
      version: PLATFORM_RELEASE_MANIFEST.current.versionTag,
      environment: process.env.NODE_ENV || 'development',
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
    };
  }

  @Get('system/version')
  getVersion() {
    return {
      success: true,
      data: PLATFORM_RELEASE_MANIFEST.current,
    };
  }

  @Get('system/releases')
  getReleases() {
    return {
      success: true,
      data: {
        current: PLATFORM_RELEASE_MANIFEST.current,
        history: PLATFORM_RELEASE_MANIFEST.history,
      },
    };
  }
}

