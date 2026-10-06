import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import express from 'express';
import * as fs from 'fs';
import * as path from 'path';
import { AppModule } from './app.module';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { rawBody: true });
  const configService = app.get(ConfigService);

  const nodeEnv = configService.get<string>('NODE_ENV', 'development');
  const corsOriginConfig = configService.get<string>('CORS_ORIGIN');

  // ARCH-004: Strict CORS origin validation
  const allowedOrigins: string[] = (() => {
    if (corsOriginConfig) {
      return corsOriginConfig
        .split(',')
        .map((o) => o.trim())
        .filter(Boolean);
    }
    // Safe default origins across production and local environments
    return [
      'https://sabinote.app',
      'https://www.sabinote.app',
      'https://sabinote.ng',
      'https://www.sabinote.ng',
      'http://localhost:3000',
      'http://127.0.0.1:3000',
    ];
  })();

  app.enableCors({
    origin: (origin, callback) => {
      // Allow non-browser requests (server-to-server, curl, webhooks) with no origin header
      if (!origin) {
        return callback(null, true);
      }
      if (allowedOrigins.includes(origin)) {
        return callback(null, true);
      }
      return callback(
        new Error(`CORS blocked for origin: ${origin} (ARCH-004)`),
        false,
      );
    },
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'x-correlation-id',
      'x-request-id',
    ],
    exposedHeaders: ['x-correlation-id'],
    credentials: true,
  });

  app.setGlobalPrefix('api/v1');

  // ARCH-014: Standardized error envelopes and correlation ID reporting
  app.useGlobalFilters(new HttpExceptionFilter());

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  app.use(express.json({ limit: '10mb' }));

  // ARCH-001: OpenAPI (Swagger) documentation setup & export
  const swaggerConfig = new DocumentBuilder()
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
        description: 'Enter JWT access token',
        in: 'header',
      },
      'JWT-auth',
    )
    .addTag('Auth', 'Authentication and session management')
    .addTag('Users', 'User account and preferences')
    .addTag('Curriculum', 'Nigerian curriculum lookup and seeding')
    .addTag('Generation', 'Lesson plan and note AI generation')
    .addTag('Notes', 'Teacher lesson note library')
    .addTag('Wallet', 'Parats balance, transactions and top-up')
    .addTag('Resources', 'Curriculum resources and documents')
    .addTag('Admin', 'Administrative operations')
    .build();

  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('api/docs', app, document);

  // Write out openapi.json for automated client generation and CI contract verification
  try {
    const openApiPath = path.join(process.cwd(), 'openapi.json');
    fs.writeFileSync(openApiPath, JSON.stringify(document, null, 2));
    console.log(`[OpenAPI] Schema written to ${openApiPath}`);
  } catch (err) {
    console.warn(`[OpenAPI] Could not write schema file:`, err);
  }

  const port = configService.get<number>('PORT', 8080);
  await app.listen(port, '0.0.0.0');
  console.log(`SabiNote API running on http://0.0.0.0:${port}/api/v1`);
  console.log(`OpenAPI documentation running on http://0.0.0.0:${port}/api/docs`);
}

bootstrap();
