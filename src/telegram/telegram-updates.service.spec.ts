import { TelegramUpdatesService } from './telegram-updates.service';
import { TelegramService } from './telegram.service';
import { TelegramLinkService } from './telegram-link.service';

describe('TelegramUpdatesService', () => {
  let telegram: { call: jest.Mock };
  let linkService: { handleUpdate: jest.Mock };
  let service: TelegramUpdatesService;

  beforeEach(() => {
    telegram = { call: jest.fn() };
    linkService = { handleUpdate: jest.fn().mockResolvedValue(undefined) };
    service = new TelegramUpdatesService(
      telegram as unknown as TelegramService,
      linkService as unknown as TelegramLinkService,
    );
    delete process.env.TELEGRAM_WEBHOOK_URL;
    process.env.TELEGRAM_WEBHOOK_SECRET = 'secret-1';
  });

  afterEach(() => {
    service.onApplicationShutdown();
  });

  it('registers the webhook with the secret when TELEGRAM_WEBHOOK_URL is set', async () => {
    process.env.TELEGRAM_WEBHOOK_URL =
      'https://api.example.com/telegram/webhook';
    telegram.call.mockResolvedValue(true);

    await service.onApplicationBootstrap();

    expect(telegram.call).toHaveBeenCalledTimes(1);
    expect(telegram.call).toHaveBeenCalledWith('setWebhook', {
      url: 'https://api.example.com/telegram/webhook',
      secret_token: 'secret-1',
      allowed_updates: ['message'],
    });
  });

  it('refuses webhook mode without TELEGRAM_WEBHOOK_SECRET', async () => {
    process.env.TELEGRAM_WEBHOOK_URL =
      'https://api.example.com/telegram/webhook';
    delete process.env.TELEGRAM_WEBHOOK_SECRET;

    await expect(service.onApplicationBootstrap()).rejects.toThrow(
      'TELEGRAM_WEBHOOK_SECRET',
    );
  });

  it('long-polls and forwards updates when no webhook URL is set', async () => {
    const update = {
      update_id: 7,
      message: { chat: { id: 1, type: 'private' }, text: '/stop' },
    };
    telegram.call.mockImplementation(
      (method: string, payload: { offset?: number }) => {
        if (method === 'deleteWebhook') return Promise.resolve(true);
        if (payload.offset === 0) return Promise.resolve([update]);
        service.onApplicationShutdown();
        return Promise.resolve([]);
      },
    );

    await service.onApplicationBootstrap();
    await service.pollingDone;

    expect(telegram.call).toHaveBeenNthCalledWith(1, 'deleteWebhook');
    expect(linkService.handleUpdate).toHaveBeenCalledWith(update);
    expect(telegram.call).toHaveBeenLastCalledWith('getUpdates', {
      offset: 8,
      timeout: 25,
      allowed_updates: ['message'],
    });
  });
});
