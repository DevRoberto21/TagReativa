import { Test, TestingModule } from '@nestjs/testing';
import { TelegramService } from './telegram.service';
import { PrismaService } from '../prisma/prisma.service';

function telegramResponse(status: number, body: object): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
  } as Response;
}

describe('TelegramService', () => {
  let service: TelegramService;
  let prisma: { user: { updateMany: jest.Mock } };
  let fetchMock: jest.SpyInstance;

  beforeEach(async () => {
    process.env.TELEGRAM_BOT_TOKEN = 'test-token';
    prisma = { user: { updateMany: jest.fn().mockResolvedValue({}) } };
    fetchMock = jest.spyOn(global, 'fetch');

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TelegramService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get<TelegramService>(TelegramService);
  });

  afterEach(() => {
    fetchMock.mockRestore();
  });

  it('fails to boot without TELEGRAM_BOT_TOKEN', () => {
    delete process.env.TELEGRAM_BOT_TOKEN;
    expect(
      () => new TelegramService(prisma as unknown as PrismaService),
    ).toThrow('TELEGRAM_BOT_TOKEN');
  });

  it('sends a text message and returns true on success', async () => {
    fetchMock.mockResolvedValueOnce(telegramResponse(200, { ok: true }));

    const result = await service.sendMessage('42', 'Olá');

    expect(result).toBe(true);
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.telegram.org/bottest-token/sendMessage',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ chat_id: '42', text: 'Olá' }),
      }),
    );
  });

  it('sends a location pin', async () => {
    fetchMock.mockResolvedValueOnce(telegramResponse(200, { ok: true }));

    const result = await service.sendLocation('42', -8.05, -34.9);

    expect(result).toBe(true);
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.telegram.org/bottest-token/sendLocation',
      expect.objectContaining({
        body: JSON.stringify({
          chat_id: '42',
          latitude: -8.05,
          longitude: -34.9,
        }),
      }),
    );
  });

  it('returns false when Telegram rejects the request', async () => {
    fetchMock.mockResolvedValueOnce(
      telegramResponse(400, { ok: false, description: 'Bad Request' }),
    );

    expect(await service.sendMessage('42', 'Olá')).toBe(false);
    expect(prisma.user.updateMany).not.toHaveBeenCalled();
  });

  it('returns false on network error', async () => {
    fetchMock.mockRejectedValueOnce(new Error('ECONNRESET'));

    expect(await service.sendMessage('42', 'Olá')).toBe(false);
  });

  it('unlinks the chat when the owner blocked the bot (403)', async () => {
    fetchMock.mockResolvedValueOnce(
      telegramResponse(403, {
        ok: false,
        description: 'Forbidden: bot was blocked by the user',
      }),
    );

    expect(await service.sendMessage('42', 'Olá')).toBe(false);
    expect(prisma.user.updateMany).toHaveBeenCalledWith({
      where: { telegramChatId: '42' },
      data: { telegramChatId: null, telegramLinkedAt: null },
    });
  });
});
