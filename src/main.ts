import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { NoticesModule } from './notices/notices.module';
import { RoomsModule } from './rooms/rooms.module';
import { AdminModule } from './admin/admin.module';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  app.set('trust proxy', 1);
  app.use(cookieParser());
  app.setGlobalPrefix('api');

  const allowedOrigins = (process.env.CORS_ORIGINS ?? '')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);

  app.enableCors({
    origin: (
      origin: string | undefined,
      callback: (err: Error | null, allow?: boolean) => void,
    ) => {
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error(`Not allowed by CORS: ${origin}`));
      }
    },
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
    credentials: true,
  });
  app.enableShutdownHooks();
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  // 서비스(일반 사용자)용 API 문서 — /api/docs
  const serviceConfig = new DocumentBuilder()
    .setTitle('Game Project API — Service')
    .setDescription('일반 사용자/서비스용 API docs')
    .setVersion('1.0')
    .addBearerAuth()
    .addServer('/')
    .build();
  const serviceDocument = SwaggerModule.createDocument(app, serviceConfig, {
    include: [AuthModule, UsersModule, NoticesModule, RoomsModule],
  });
  SwaggerModule.setup('api/docs', app, serviceDocument, {
    swaggerOptions: { withCredentials: true },
  });

  // 관리자용 API 문서 — /api/docs/admin
  const adminConfig = new DocumentBuilder()
    .setTitle('Game Project API — Admin')
    .setDescription('관리자 전용 API docs (ADMIN 권한 필요)')
    .setVersion('1.0')
    .addBearerAuth()
    .addServer('/')
    .build();
  const adminDocument = SwaggerModule.createDocument(app, adminConfig, {
    include: [AdminModule],
  });
  SwaggerModule.setup('api/docs/admin', app, adminDocument, {
    swaggerOptions: { withCredentials: true },
  });

  await app.listen(process.env.PORT ?? 3000);
}
void bootstrap();
