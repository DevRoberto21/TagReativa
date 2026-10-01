import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  // Number of reverse proxies in front of the app (Render adds its own).
  // Without it, req.ip is the proxy's address and every client shares one
  // rate-limit bucket. 0 (default) keeps local dev reading the socket address.
  app.set('trust proxy', parseInt(process.env.TRUST_PROXY_HOPS ?? '0', 10));

  const { default: helmet } = await import('helmet');

  app.use(helmet());

  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  const allowedOrigins = [
    'http://localhost:5173',
    process.env.FRONTEND_URL,
  ].filter((origin): origin is string => Boolean(origin));

  app.enableCors({
    origin: allowedOrigins,
    credentials: true,
  });

  const port = parseInt(process.env.PORT ?? '3000', 10);
  await app.listen(port);
  console.log(`Server is running on port ${port}`);
}

void bootstrap();
