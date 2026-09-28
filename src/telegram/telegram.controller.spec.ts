import { Test, TestingModule } from '@nestjs/testing';
import { UnauthorizedException } from '@nestjs/common';
import { TelegramController } from './telegram.controller';
import { TelegramLinkService } from './telegram-link.service';

describe('TelegramController', () => {
  let controller: TelegramController;
  let linkService: {
    createLink: jest.Mock;
    unlink: jest.Mock;
    handleUpdate: jest.Mock;
  };
  const update = { update_id: 1 };

  beforeEach(async () => {
    process.env.TELEGRAM_WEBHOOK_SECRET = 'secret-1';
    linkService = {
      createLink: jest.fn().mockResolvedValue({ url: 'https://t.me/x' }),
      unlink: jest.fn().mockResolvedValue(undefined),
      handleUpdate: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [TelegramController],
      providers: [{ provide: TelegramLinkService, useValue: linkService }],
    }).compile();

    controller = module.get<TelegramController>(TelegramController);
  });

  it('forwards the update when the secret header matches', async () => {
    await controller.webhook('secret-1', update);

    expect(linkService.handleUpdate).toHaveBeenCalledWith(update);
  });

  it.each([['wrong'], [undefined]])(
    'rejects the webhook when the secret header is %s',
    async (header) => {
      await expect(controller.webhook(header, update)).rejects.toThrow(
        UnauthorizedException,
      );
      expect(linkService.handleUpdate).not.toHaveBeenCalled();
    },
  );

  it('rejects every webhook call when no secret is configured', async () => {
    delete process.env.TELEGRAM_WEBHOOK_SECRET;

    await expect(controller.webhook('', update)).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('answers 200 even when handling the update fails, so Telegram does not retry forever', async () => {
    linkService.handleUpdate.mockRejectedValueOnce(new Error('db down'));

    await expect(controller.webhook('secret-1', update)).resolves.toEqual({
      ok: true,
    });
  });

  it('creates a link for the authenticated user', async () => {
    const result = await controller.createLink({ user: { userId: 'user-1' } });

    expect(linkService.createLink).toHaveBeenCalledWith('user-1');
    expect(result).toEqual({ url: 'https://t.me/x' });
  });

  it('unlinks the authenticated user', async () => {
    await controller.unlink({ user: { userId: 'user-1' } });

    expect(linkService.unlink).toHaveBeenCalledWith('user-1');
  });
});
