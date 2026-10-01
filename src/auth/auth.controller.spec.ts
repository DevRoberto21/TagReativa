import { ExecutionContext, INestApplication } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import { Test } from '@nestjs/testing';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import request from 'supertest';
import { App } from 'supertest/types';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';

describe('AuthController rate limiting', () => {
  let app: INestApplication<App>;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      imports: [ThrottlerModule.forRoot([{ ttl: 60000, limit: 100 }])],
      controllers: [AuthController],
      providers: [
        {
          provide: AuthService,
          useValue: {
            login: jest.fn(),
            enableTwoFactor: jest.fn(),
            changePassword: jest.fn(),
          },
        },
        { provide: APP_GUARD, useClass: ThrottlerGuard },
      ],
    })
      .overrideGuard(AuthGuard('jwt'))
      .useValue({
        canActivate: (context: ExecutionContext) => {
          context.switchToHttp().getRequest<{ user: unknown }>().user = {
            userId: 'user-1',
          };
          return true;
        },
      })
      .compile();

    app = module.createNestApplication();
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  it('allows 5 login attempts per minute and blocks the 6th', async () => {
    for (let i = 0; i < 5; i++) {
      await request(app.getHttpServer()).post('/auth/login').expect(201);
    }
    await request(app.getHttpServer()).post('/auth/login').expect(429);
  });

  it('allows 3 two-factor code emails per minute and blocks the 4th', async () => {
    for (let i = 0; i < 3; i++) {
      await request(app.getHttpServer()).post('/auth/2fa/enable').expect(201);
    }
    await request(app.getHttpServer()).post('/auth/2fa/enable').expect(429);
  });

  it('allows 5 password changes per minute and blocks the 6th', async () => {
    for (let i = 0; i < 5; i++) {
      await request(app.getHttpServer())
        .post('/auth/change-password')
        .expect(201);
    }
    await request(app.getHttpServer())
      .post('/auth/change-password')
      .expect(429);
  });
});
