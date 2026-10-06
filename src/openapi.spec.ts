import { Test } from '@nestjs/testing';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import * as fs from 'fs';
import * as path from 'path';
import { AppModule } from './app.module';

describe('OpenAPI Generator & Route Contract Test (ARCH-001)', () => {
  it('should generate openapi.json and verify all live controller routes exist', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    const app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1');

    const config = new DocumentBuilder()
      .setTitle('SabiNote API')
      .setDescription(
        'SabiNote Education Platform API — Grounded Nigerian Lesson & Curriculum Engine',
      )
      .setVersion('2.0.0-baseline')
      .addBearerAuth(
        {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          name: 'Authorization',
          in: 'header',
        },
        'JWT-auth',
      )
      .addTag('Auth')
      .addTag('Users')
      .addTag('Curriculum')
      .addTag('Generation')
      .addTag('Notes')
      .addTag('Wallet')
      .addTag('Resources')
      .addTag('Admin')
      .build();

    const document = SwaggerModule.createDocument(app, config);

    expect(document.openapi).toBeDefined();
    expect(document.paths).toBeDefined();

    // Verify previously omitted live routes are captured (ARCH-001 & ARCH-007)
    expect(document.paths['/api/v1/wallet/packages']).toBeDefined();
    expect(document.paths['/api/v1/wallet/topup/manual']).toBeDefined();
    expect(document.paths['/api/v1/curriculum/general/seed']).toBeDefined();
    expect(document.paths['/api/v1/generate/lesson-note/stream']).toBeDefined();
    expect(document.paths['/api/v1/curriculum/releases']).toBeDefined();
    expect(document.paths['/api/v1/curriculum/releases/{id}/units']).toBeDefined();

    // Write openapi.json to repo root
    const outputPath = path.resolve(__dirname, '..', 'openapi.json');
    fs.writeFileSync(outputPath, JSON.stringify(document, null, 2));

    await app.close();
  }, 30000);
});
