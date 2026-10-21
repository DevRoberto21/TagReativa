import { INestApplication, ValidationPipe } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { ThrottlerStorage, ThrottlerStorageService } from '@nestjs/throttler';
import * as bcrypt from 'bcrypt';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import type { App } from 'supertest/types';
import { PrismaService } from './prisma/prisma.service';
import { EmailService } from './email/email.service';
import { TelegramService } from './telegram/telegram.service';
import { TelegramUpdatesService } from './telegram/telegram-updates.service';
import { TokenCleanupService } from './token-cleanup.service';
import { AppModule } from './app.module';

// Boots the real AppModule (guards, throttler, pipes, routing) with every
// provider that touches the database or the network replaced by a mock.
describe('Security pipeline over HTTP', () => {
  const originalEnv = process.env;
  const petId = '3f2b8c1e-9a4d-4e7b-b1c2-5d6e7f8a9b0c';
  let app: INestApplication<App>;
  let prisma: {
    user: { findUnique: jest.Mock };
    pet: { update: jest.Mock };
  };
  let token: string;
  let throttlerStorage: ThrottlerStorageService;

  beforeAll(async () => {
    process.env = {
      ...originalEnv,
      NODE_ENV: 'test',
      JWT_SECRET: 'pipeline-test-secret',
      TELEGRAM_WEBHOOK_SECRET: 'webhook-secret',
      CLOUDINARY_API_KEY: 'key',
      CLOUDINARY_API_SECRET: 'secret',
    };
    prisma = {
      user: { findUnique: jest.fn() },
      pet: { update: jest.fn() },
    };

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService)
      .useValue(prisma)
      .overrideProvider(EmailService)
      .useValue({ send: jest.fn().mockResolvedValue(true) })
      .overrideProvider(TelegramService)
      .useValue({ sendMessage: jest.fn(), call: jest.fn() })
      .overrideProvider(TelegramUpdatesService)
      .useValue({})
      .overrideProvider(TokenCleanupService)
      .useValue({})
      .compile();

    app = moduleRef.createNestApplication();
    // Same middleware as main.ts.
    app.use(cookieParser());
    // Same pipe as main.ts.
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: true }),
    );
    await app.init();

    throttlerStorage = moduleRef.get<ThrottlerStorageService>(ThrottlerStorage);
    token = moduleRef
      .get(JwtService)
      .sign({ sub: 'user-1', email: 'owner@example.com', ver: 0 });
  });

  afterAll(async () => {
    await app.close();
    process.env = originalEnv;
  });

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.user.findUnique.mockResolvedValue(null);
  });

  it('answers 401 on a protected route without a token', async () => {
    await request(app.getHttpServer()).get('/users/me').expect(401);
  });

  it('authenticates with the access_token cookie', async () => {
    prisma.user.findUnique.mockResolvedValue({ tokenVersion: 0 });
    prisma.pet.update.mockResolvedValue({ id: petId });

    await request(app.getHttpServer())
      .patch(`/pets/${petId}`)
      .set('Cookie', `access_token=${token}`)
      .send({ name: 'Rex' })
      .expect(200);
  });

  it('drops body fields the DTO does not declare', async () => {
    prisma.user.findUnique.mockResolvedValue({ tokenVersion: 0 });
    prisma.pet.update.mockResolvedValue({ id: petId });

    await request(app.getHttpServer())
      .patch(`/pets/${petId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Rex', ownerId: 'attacker', shortCode: 'AAAAAAAA' })
      .expect(200);

    expect(prisma.pet.update).toHaveBeenCalledWith({
      where: { id: petId, ownerId: 'user-1' },
      data: { name: 'Rex' },
    });
  });

  it.each([
    ['without a secret', {}],
    ['with a wrong secret', { 'x-telegram-bot-api-secret-token': 'nope' }],
  ])('rejects the Telegram webhook %s', async (_case, headers) => {
    await request(app.getHttpServer())
      .post('/telegram/webhook')
      .set(headers)
      .send({ message: { chat: { id: 1 }, text: '/start x' } })
      .expect(401);
  });

  it('sets the JWT as an httpOnly cookie and keeps it out of the login body', async () => {
    const password = 'Senha-certa1';
    prisma.user.findUnique.mockResolvedValue({
      id: 'user-1',
      email: 'owner@example.com',
      passwordHash: bcrypt.hashSync(password, 10),
      tokenVersion: 0,
      twoFactorEnabled: false,
    });

    const res = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'owner@example.com', password })
      .expect(201);

    const cookies = [res.headers['set-cookie']].flat().join('; ');
    expect(cookies).toMatch(/access_token=[^;]+/);
    expect(cookies).toContain('HttpOnly');
    expect(res.body).not.toHaveProperty('access_token');
    // This login counts against the per-IP limit; clear it so the
    // throttle test below starts from a clean window.
    throttlerStorage.storage.clear();
  });

  it('throttles login with 429 on the 6th attempt in a minute', async () => {
    const attempt = () =>
      request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: 'owner@example.com', password: 'Senha-errada1' });

    for (let i = 0; i < 5; i++) await attempt().expect(401);
    await attempt().expect(429);
  });
});
