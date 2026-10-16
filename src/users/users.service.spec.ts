import { Test, TestingModule } from '@nestjs/testing';
import { UsersService } from './users.service';
import { PrismaService } from '../prisma/prisma.service';
import { ConflictException, ForbiddenException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
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

  describe('updateMe', () => {
    beforeEach(async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: 'user-1',
        passwordHash: await bcrypt.hash('senha123', 10),
      });
    });

    it('saves the profile fields when the password is correct', async () => {
      await service.updateMe('user-1', {
        name: 'Novo Nome',
        whatsapp: '5581912345678',
        age: 30,
        password: 'senha123',
      });

      expect(prisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'user-1' },
          data: { name: 'Novo Nome', whatsapp: '5581912345678', age: 30 },
        }),
      );
    });

    it('rejects a wrong password with 403 and keeps the profile', async () => {
      await expect(
        service.updateMe('user-1', {
          name: 'Novo Nome',
          password: 'errada123',
        }),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(prisma.user.update).not.toHaveBeenCalled();
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
  describe('contact conflicts', () => {
    const uniqueViolation = () =>
      new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
        code: 'P2002',
        clientVersion: 'test',
      });

    const newUser = {
      name: 'Ana',
      email: 'ana@example.com',
      password: 'senha1234',
      whatsapp: '5511988887777',
    };

    it('answers 409 with one message when the e-mail is taken', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 'user-9' });

      await expect(service.create(newUser)).rejects.toThrow(
        new ConflictException('E-mail ou WhatsApp já cadastrado.'),
      );
      expect(prisma.user.create).not.toHaveBeenCalled();
    });

    it('answers the same 409 when the WhatsApp number is taken at registration', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      prisma.user.create.mockRejectedValue(uniqueViolation());

      await expect(service.create(newUser)).rejects.toThrow(
        new ConflictException('E-mail ou WhatsApp já cadastrado.'),
      );
    });

    it('answers 409 when a profile update uses a taken WhatsApp number', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: 'user-1',
        passwordHash: await bcrypt.hash('senha1234', 10),
      });
      prisma.user.update.mockRejectedValue(uniqueViolation());

      await expect(
        service.updateMe('user-1', {
          whatsapp: '5511988887777',
          password: 'senha1234',
        }),
      ).rejects.toThrow(ConflictException);
    });

    it('rethrows errors that are not unique violations', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      prisma.user.create.mockRejectedValue(new Error('db down'));

      await expect(service.create(newUser)).rejects.toThrow('db down');
    });
  });
});
