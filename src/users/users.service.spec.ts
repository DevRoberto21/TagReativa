import { Test, TestingModule } from '@nestjs/testing';
import { UsersService } from './users.service';
import { PrismaService } from '../prisma/prisma.service';
import { CallMeBotService } from '../callmebot/callmebot.service';
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
      providers: [
        UsersService,
        { provide: PrismaService, useValue: prisma },
        { provide: CallMeBotService, useValue: { send: jest.fn() } },
      ],
    }).compile();

    service = module.get<UsersService>(UsersService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
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
