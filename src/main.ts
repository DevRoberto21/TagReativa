import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  app.enableCors({
    origin: 'http://localhost:5173',
    credentials: true,
  });

  const defaultPort = parseInt(process.env.PORT ?? '3000', 10);
  try {
    await app.listen(defaultPort);
    console.log(`Server is running on http://localhost:${defaultPort}`);
  } catch (error) {
    const err = error as NodeJS.ErrnoException;
    if (err?.code === 'EADDRINUSE') {
      const fallbackPort = defaultPort + 1;
      console.warn(
        `Port ${defaultPort} is already in use. Starting on port ${fallbackPort} instead.`,
      );
      await app.listen(fallbackPort);
      console.log(`Server is running on http://localhost:${fallbackPort}`);
    } else {
      throw error;
    }
  }
}

void bootstrap();
