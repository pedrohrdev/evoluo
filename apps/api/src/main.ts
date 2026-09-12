import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  // O frontend (Vercel) proxeia todo `/api/*` para cá (apps/web/next.config.ts),
  // então o IP do socket é sempre o do proxy, nunca o do usuário. Sem confiar
  // no primeiro salto, `req.ips` fica vazio e o rate limit agrupa o app inteiro
  // num balde só — ver UserThrottlerGuard. Confiamos em exatamente 1 salto (o
  // proxy do Next), não em qualquer X-Forwarded-For que chegue de fora.
  app.set('trust proxy', 1);

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  const port = process.env.PORT ?? 3001;
  await app.listen(port);
}

bootstrap();
