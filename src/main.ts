import { NestFactory } from '@nestjs/core';
import { ValidationPipe, VersioningType } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

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
  const allowedOrigins = (process.env.CORS_ORIGINS ?? '')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);
  const b2cOrigin = process.env.B2C_ORIGIN ?? 'http://localhost:3002';

  app.enableCors({
    origin: (origin, cb) => {
      // Finance endpoints reject B2C origin — admin only
      // (request-path check is in the callback via a NestJS middleware instead;
      //  CORS here allows admin + same-origin, B2C for non-finance)
      if (!origin || allowedOrigins.length === 0) return cb(null, true);
      if (allowedOrigins.includes(origin)) return cb(null, true);
      cb(new Error('Not allowed by CORS'), false);
    },
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  });

  // ponytail: Block B2C origin from /finance/** at middleware level (belt+suspenders)
  app.use((req: any, res: any, next: any) => {
    const origin = req.headers['origin'] as string | undefined;
    if (origin === b2cOrigin && req.path.startsWith('/api/v1/finance')) {
      return res.status(403).json({ message: 'Finance endpoints not accessible from B2C origin' });
    }
    next();
  });

  // API versioning
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
  app.setGlobalPrefix('api');

  // Swagger (dev only)
  if (process.env.NODE_ENV !== 'production') {
    const config = new DocumentBuilder()
      .setTitle('iCar Dealership API')
      .setDescription('Multi-location car dealership management API — Egypt market')
      .setVersion('1.0')
      .addBearerAuth()
      .build();
    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup('api/docs', app, document);
  }

  const port = process.env.PORT ?? 4000;
  await app.listen(port);
  console.log(`🚀  API running on http://localhost:${port}/api`);
}

bootstrap();
