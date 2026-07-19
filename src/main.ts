import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { ValidationPipe, VersioningType } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import * as Sentry from '@sentry/nestjs';
import { Logger } from 'nestjs-pino';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { join, basename } from 'path';
import { existsSync, mkdirSync } from 'fs';
import { AppModule } from './app.module';

async function bootstrap() {
  // ponytail: Sentry init before app creation so it instruments everything
  if (process.env.SENTRY_DSN) {
    Sentry.init({
      dsn: process.env.SENTRY_DSN,
      environment: process.env.NODE_ENV ?? 'development',
      tracesSampleRate: 0.1,
    });
  }

  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bufferLogs: true,
  });

  // Structured JSON logging via Pino
  app.useLogger(app.get(Logger));

  // Security headers — must come before any other middleware/routes
  app.use(helmet());

  // ponytail: httpOnly cookie auth per spec 08
  app.use(cookieParser());

  // Global validation pipe
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  // CORS
  // ponytail: allow all localhost:3xxx + any explicit CORS_ORIGINS from env
  const envOrigins = (process.env.CORS_ORIGINS ?? '')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);
  const devLocalhostRe = /^http:\/\/localhost:(3\d{3}|4\d{3})$/;

  app.enableCors({
    origin: (origin, cb) => {
      if (!origin) return cb(null, true); // same-origin / curl
      if (devLocalhostRe.test(origin)) return cb(null, true);
      if (envOrigins.includes(origin)) return cb(null, true);
      cb(new Error('Not allowed by CORS'), false);
    },
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  });

  // ponytail: block B2C ports from /finance/** — admin-only endpoints
  const adminOrigins = ['http://localhost:3001', ...(process.env.ADMIN_ORIGINS ?? '').split(',').filter(Boolean)];
  app.use((req: any, res: any, next: any) => {
    const origin = req.headers['origin'] as string | undefined;
    if (origin && !adminOrigins.includes(origin) && req.path.startsWith('/api/v1/finance')) {
      return res.status(403).json({ message: 'Finance endpoints not accessible from this origin' });
    }
    next();
  });

  // ponytail: static file serving before auth guards — img tags can't send JWT
  const uploadsDir = process.env.UPLOAD_DIR ?? join(process.cwd(), 'uploads');
  if (!existsSync(uploadsDir)) mkdirSync(uploadsDir, { recursive: true });
  const serveUpload = (req: any, res: any) => {
    const safeName = basename(req.path);
    const filePath = join(uploadsDir, safeName);
    if (!existsSync(filePath)) return res.status(404).send('Not found');
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    res.sendFile(filePath);
  };
  app.use('/uploads', serveUpload);
  // Also serve at the versioned API path so stored URLs (api/v1/upload/files/*) work from <img> tags
  app.use('/api/v1/upload/files', serveUpload);

  // API versioning
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
  app.setGlobalPrefix('api');

  // Swagger (dev only)
  if (process.env.NODE_ENV !== 'production') {
    const config = new DocumentBuilder()
      .setTitle('iCar Dealership API')
      .setDescription(
        'Multi-location car dealership management API — Egypt market',
      )
      .setVersion('1.0')
      .addBearerAuth()
      .build();
    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup('api/docs', app, document);
  }

  const port = process.env.PORT ?? 4001;
  await app.listen(port);
  console.log(`🚀  API running on http://localhost:${port}/api`);
}

bootstrap();
