import {
  Injectable,
  OnApplicationBootstrap,
  OnApplicationShutdown,
} from '@nestjs/common';
import { TelegramService } from './telegram.service';
import { TelegramLinkService, TelegramUpdate } from './telegram-link.service';

const POLL_TIMEOUT_S = 25;
const POLL_RETRY_MS = 5000;
const ALLOWED_UPDATES = ['message'];

// Chooses how updates reach the bot: a webhook in production (public HTTPS
// URL available) or long polling in local development.
@Injectable()
export class TelegramUpdatesService
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  private polling = false;
  pollingDone: Promise<void> = Promise.resolve();

  constructor(
    private telegram: TelegramService,
    private linkService: TelegramLinkService,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    const webhookUrl = process.env.TELEGRAM_WEBHOOK_URL;

    if (webhookUrl) {
      const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
      if (!secret) {
        throw new Error('FATAL: TELEGRAM_WEBHOOK_SECRET não definido.');
      }
      await this.telegram.call('setWebhook', {
        url: webhookUrl,
        secret_token: secret,
        allowed_updates: ALLOWED_UPDATES,
      });
      console.log('[TELEGRAM] webhook registrado.');
      return;
    }

    // getUpdates is refused while a webhook is registered.
    await this.telegram.call('deleteWebhook');
    this.polling = true;
    this.pollingDone = this.poll();
    console.log('[TELEGRAM] long polling iniciado.');
  }

  onApplicationShutdown(): void {
    this.polling = false;
  }

  private async poll(): Promise<void> {
    let offset = 0;
    while (this.polling) {
      try {
        const updates = await this.telegram.call<TelegramUpdate[]>(
          'getUpdates',
          { offset, timeout: POLL_TIMEOUT_S, allowed_updates: ALLOWED_UPDATES },
        );
        for (const update of updates) {
          offset = update.update_id + 1;
          await this.linkService
            .handleUpdate(update)
            .catch((err) =>
              console.error('[TELEGRAM] falha ao processar update:', err),
            );
        }
      } catch (err) {
        console.error('[TELEGRAM] getUpdates falhou:', err);
        await new Promise((resolve) => setTimeout(resolve, POLL_RETRY_MS));
      }
    }
  }
}
