import { Test, TestingModule } from '@nestjs/testing';
import { AppController } from './app.controller';
import { AppService } from './app.service';

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
      expect(res.data.version).toBe('v2.0.0-baseline');
      expect(res.data.status).toBe('healthy');
    });

    it('should return health check details', () => {
      const res = appController.getHealth();
      expect(res.status).toBe('ok');
      expect(res.version).toBe('v2.0.0-baseline');
      expect(res.uptime).toBeDefined();
    });
  });
});
