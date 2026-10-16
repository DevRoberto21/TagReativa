import { Test, TestingModule } from '@nestjs/testing';
import { createHash } from 'crypto';
import { TelegramLinkService, TelegramUpdate } from './telegram-link.service';
import { TelegramService } from './telegram.service';
import { PrismaService } from '../prisma/prisma.service';

const hash = (token: string) =>
  createHash('sha256').update(token).digest('hex');

function startUpdate(text: string, chatType = 'private'): TelegramUpdate {
  return {
    update_id: 1,
    message: { chat: { id: 42, type: chatType }, text },
  };
}

describe('TelegramLinkService', () => {
  let service: TelegramLinkService;
  let prisma: {
    telegramLinkToken: {
      deleteMany: jest.Mock;
      create: jest.Mock;
      findUnique: jest.Mock;
      updateMany: jest.Mock;
    };
    user: { update: jest.Mock; updateMany: jest.Mock; findFirst: jest.Mock };
    $transaction: jest.Mock;
  };
  let telegram: { sendMessage: jest.Mock };

  beforeEach(async () => {
    process.env.TELEGRAM_BOT_USERNAME = 'TagReativaBot';
    prisma = {
      telegramLinkToken: {
        deleteMany: jest.fn().mockResolvedValue({}),
        create: jest.fn().mockResolvedValue({}),
        findUnique: jest.fn(),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      user: {
        update: jest.fn().mockResolvedValue({ name: 'Roberto' }),
        updateMany: jest.fn().mockResolvedValue({}),
        findFirst: jest.fn().mockResolvedValue(null),
      },
      $transaction: jest.fn((arg: unknown) =>
        typeof arg === 'function'
          ? (arg as (tx: unknown) => unknown)(prisma)
          : Promise.all(arg as Promise<unknown>[]),
      ),
    };
    telegram = { sendMessage: jest.fn().mockResolvedValue(true) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TelegramLinkService,
        { provide: PrismaService, useValue: prisma },
        { provide: TelegramService, useValue: telegram },
      ],
    }).compile();

    service = module.get<TelegramLinkService>(TelegramLinkService);
  });

  describe('createLink', () => {
    it('replaces unused tokens and returns a deep link with a hashed token stored', async () => {
      const { url } = await service.createLink('user-1');

      const match = /^https:\/\/t\.me\/TagReativaBot\?start=([\w-]{43})$/.exec(
        url,
      );
      expect(match).not.toBeNull();
      expect(prisma.telegramLinkToken.deleteMany).toHaveBeenCalledWith({
        where: { userId: 'user-1', usedAt: null },
      });
      type CreateArgs = [
        { data: { userId: string; tokenHash: string; expiresAt: Date } },
      ];
      const [{ data }] = prisma.telegramLinkToken.create.mock
        .calls[0] as CreateArgs;
      expect(data.userId).toBe('user-1');
      expect(data.tokenHash).toBe(hash(match![1]));
      expect(data.expiresAt.getTime()).toBeGreaterThan(Date.now());
    });
  });

  describe('handleUpdate', () => {
    const validRecord = {
      id: 'tok-1',
      userId: 'user-1',
      usedAt: null,
      expiresAt: new Date(Date.now() + 60_000),
    };

    const anyDate: unknown = expect.any(Date);

    it('links the chat on a valid /start token', async () => {
      prisma.telegramLinkToken.findUnique.mockResolvedValue(validRecord);

      await service.handleUpdate(startUpdate('/start abc'));

      expect(prisma.telegramLinkToken.findUnique).toHaveBeenCalledWith({
        where: { tokenHash: hash('abc') },
      });
      expect(prisma.user.findFirst).toHaveBeenCalledWith({
        where: { telegramChatId: '42', NOT: { id: 'user-1' } },
        select: { id: true },
      });
      expect(prisma.user.updateMany).not.toHaveBeenCalled();
      expect(prisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'user-1' },
          data: { telegramChatId: '42', telegramLinkedAt: anyDate },
        }),
      );
      expect(prisma.telegramLinkToken.updateMany).toHaveBeenCalledWith({
        where: { id: 'tok-1', usedAt: null, expiresAt: { gt: anyDate } },
        data: { usedAt: anyDate },
      });
      expect(telegram.sendMessage).toHaveBeenCalledWith(
        '42',
        expect.stringContaining('ativados'),
      );
    });

    it('refuses to move a chat that is linked to another account', async () => {
      prisma.telegramLinkToken.findUnique.mockResolvedValue(validRecord);
      prisma.user.findFirst.mockResolvedValue({ id: 'user-9' });

      await service.handleUpdate(startUpdate('/start abc'));

      expect(prisma.user.update).not.toHaveBeenCalled();
      expect(prisma.user.updateMany).not.toHaveBeenCalled();
      expect(prisma.telegramLinkToken.updateMany).not.toHaveBeenCalled();
      expect(telegram.sendMessage).toHaveBeenCalledTimes(1);
      expect(telegram.sendMessage).toHaveBeenCalledWith(
        '42',
        expect.stringContaining('/stop'),
      );
    });

    it('rejects a token consumed by a concurrent /start', async () => {
      prisma.telegramLinkToken.findUnique.mockResolvedValue(validRecord);
      prisma.telegramLinkToken.updateMany.mockResolvedValue({ count: 0 });

      await service.handleUpdate(startUpdate('/start abc'));

      expect(prisma.user.update).not.toHaveBeenCalled();
      expect(telegram.sendMessage).toHaveBeenCalledWith(
        '42',
        expect.stringContaining('expirou'),
      );
    });

    it.each([
      ['unknown', null],
      ['expired', { ...validRecord, expiresAt: new Date(Date.now() - 1) }],
      ['reused', { ...validRecord, usedAt: new Date() }],
    ])('rejects an %s token', async (_label, record) => {
      prisma.telegramLinkToken.findUnique.mockResolvedValue(record);

      await service.handleUpdate(startUpdate('/start abc'));

      expect(prisma.user.update).not.toHaveBeenCalled();
      expect(telegram.sendMessage).toHaveBeenCalledWith(
        '42',
        expect.stringContaining('expirou'),
      );
    });

    it('replies with instructions on /start without token', async () => {
      await service.handleUpdate(startUpdate('/start'));

      expect(prisma.telegramLinkToken.findUnique).not.toHaveBeenCalled();
      expect(telegram.sendMessage).toHaveBeenCalledWith(
        '42',
        expect.stringContaining('perfil'),
      );
    });

    it('ignores messages from groups', async () => {
      await service.handleUpdate(startUpdate('/start abc', 'group'));

      expect(prisma.telegramLinkToken.findUnique).not.toHaveBeenCalled();
      expect(telegram.sendMessage).not.toHaveBeenCalled();
    });

    it('ignores updates without a text message', async () => {
      await service.handleUpdate({ update_id: 1 });

      expect(telegram.sendMessage).not.toHaveBeenCalled();
    });

    it('unlinks the chat on /stop', async () => {
      await service.handleUpdate(startUpdate('/stop'));

      expect(prisma.user.updateMany).toHaveBeenCalledWith({
        where: { telegramChatId: '42' },
        data: { telegramChatId: null, telegramLinkedAt: null },
      });
      expect(telegram.sendMessage).toHaveBeenCalledWith(
        '42',
        expect.stringContaining('desativados'),
      );
    });
  });

  describe('unlink', () => {
    it('clears the chat of the user', async () => {
      await service.unlink('user-1');

      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        data: { telegramChatId: null, telegramLinkedAt: null },
      });
      expect(prisma.telegramLinkToken.deleteMany).toHaveBeenCalledWith({
        where: { userId: 'user-1' },
      });
    });
  });
});

describe('TelegramLinkService config', () => {
  const env = { ...process.env };
  afterEach(() => {
    process.env = { ...env };
  });

  const build = () =>
    new TelegramLinkService({} as PrismaService, {} as TelegramService);

  it('fails to start in production without TELEGRAM_BOT_USERNAME', () => {
    process.env.NODE_ENV = 'production';
    delete process.env.TELEGRAM_BOT_USERNAME;
    expect(build).toThrow('TELEGRAM_BOT_USERNAME');
  });

  it('starts outside production without TELEGRAM_BOT_USERNAME', () => {
    process.env.NODE_ENV = 'development';
    delete process.env.TELEGRAM_BOT_USERNAME;
    expect(build).not.toThrow();
  });
});
