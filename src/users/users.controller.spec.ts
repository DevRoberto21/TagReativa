import { ExecutionContext, INestApplication } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import { Test, TestingModule } from '@nestjs/testing';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import request from 'supertest';
import { App } from 'supertest/types';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';

describe('UsersController', () => {
  let controller: UsersController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [UsersController],
      providers: [
        {
          provide: UsersService,
          useValue: {
            create: jest.fn(),
            findMe: jest.fn(),
            updateMe: jest.fn(),
            deleteMe: jest.fn(),
          },
        },
      ],
    }).compile();

    controller = module.get<UsersController>(UsersController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});

describe('UsersController rate limiting', () => {
  let app: INestApplication<App>;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      imports: [ThrottlerModule.forRoot([{ ttl: 60000, limit: 100 }])],
      controllers: [UsersController],
      providers: [
        {
          provide: UsersService,
          useValue: {
            create: jest.fn(),
            updateMe: jest.fn(),
            deleteMe: jest.fn(),
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

  it('allows 3 registrations per minute and blocks the 4th', async () => {
    for (let i = 0; i < 3; i++) {
      await request(app.getHttpServer()).post('/users/register').expect(201);
    }
    await request(app.getHttpServer()).post('/users/register').expect(429);
  });

  it('allows 5 profile updates per minute and blocks the 6th', async () => {
    for (let i = 0; i < 5; i++) {
      await request(app.getHttpServer())
        .patch('/users/me')
        .send({ password: 'x' })
        .expect(200);
    }
    await request(app.getHttpServer())
      .patch('/users/me')
      .send({ password: 'x' })
      .expect(429);
  });

  it('allows 5 account deletion attempts per minute and blocks the 6th', async () => {
    for (let i = 0; i < 5; i++) {
      await request(app.getHttpServer())
        .delete('/users/me')
        .send({ password: 'x' })
        .expect(200);
    }
    await request(app.getHttpServer())
      .delete('/users/me')
      .send({ password: 'x' })
      .expect(429);
  });
});
