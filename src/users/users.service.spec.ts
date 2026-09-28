import { Test, TestingModule } from '@nestjs/testing';
import { UsersService } from './users.service';
import { PrismaService } from '../prisma/prisma.service';
import { ForbiddenException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';

describe('UsersService', () => {
  let service: UsersService;
  let prisma: { user: Record<string, jest.Mock> };

  beforeEach(async () => {
    prisma = {
      user: {
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
    };
    const module: TestingModule = await Test.createTestingModule({
      providers: [UsersService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = module.get<UsersService>(UsersService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('findMe', () => {
    it('exposes whether Telegram is linked without leaking the chat id', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: 'user-1',
        name: 'Roberto',
        telegramChatId: '42',
      });

      const result = await service.findMe('user-1');

      expect(result).toMatchObject({ id: 'user-1', telegramLinked: true });
      expect(result).not.toHaveProperty('telegramChatId');
    });

    it('reports telegramLinked false when no chat is linked', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: 'user-1',
        telegramChatId: null,
      });

      expect(await service.findMe('user-1')).toMatchObject({
        telegramLinked: false,
      });
    });
  });

  describe('deleteMe', () => {
    beforeEach(async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: 'user-1',
        passwordHash: await bcrypt.hash('senha123', 10),
      });
    });

    it('deletes the account when the password is correct', async () => {
      await service.deleteMe('user-1', { password: 'senha123' });

      expect(prisma.user.delete).toHaveBeenCalledWith({
        where: { id: 'user-1' },
      });
    });

    it('rejects a wrong password with 403 and keeps the account', async () => {
      await expect(
        service.deleteMe('user-1', { password: 'errada123' }),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(prisma.user.delete).not.toHaveBeenCalled();
    });
  });
});
