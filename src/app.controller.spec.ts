import { Test, TestingModule } from '@nestjs/testing';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PLATFORM_RELEASE_MANIFEST } from './common/config/release.manifest';

describe('AppController', () => {
  let appController: AppController;

  beforeEach(async () => {
    const app: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
      providers: [AppService],
    }).compile();

    appController = app.get<AppController>(AppController);
  });

  describe('root', () => {
    it('should return API metadata and status', () => {
      const res = appController.getRoot();
      expect(res.success).toBe(true);
      expect(res.data.name).toBe('SabiNote API');
      expect(res.data.version).toBe(PLATFORM_RELEASE_MANIFEST.current.versionTag);
      expect(res.data.curriculumBaseline).toBe(PLATFORM_RELEASE_MANIFEST.current.curriculumBaseline.tag);
      expect(res.data.status).toBe('healthy');
    });

    it('should return health check details', () => {
      const res = appController.getHealth();
      expect(res.status).toBe('ok');
      expect(res.version).toBe(PLATFORM_RELEASE_MANIFEST.current.versionTag);
      expect(res.uptime).toBeDefined();
    });

    it('should return current system version manifest', () => {
      const res = appController.getVersion();
      expect(res.success).toBe(true);
      expect(res.data.version).toBe(PLATFORM_RELEASE_MANIFEST.current.version);
      expect(res.data.curriculumBaseline.totalUnits).toBe(6182);
    });

    it('should return full release history', () => {
      const res = appController.getReleases();
      expect(res.success).toBe(true);
      expect(res.data.current.version).toBe(PLATFORM_RELEASE_MANIFEST.current.version);
      expect(res.data.history.length).toBeGreaterThan(0);
    });
  });
});

