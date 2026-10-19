import {
  Injectable,
  OnApplicationBootstrap,
  OnApplicationShutdown,
} from '@nestjs/common';
import { TelegramApiError, TelegramService } from './telegram.service';
import { TelegramLinkService, TelegramUpdate } from './telegram-link.service';
import { describeError } from '../describe-error';

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

    // A registered webhook belongs to another instance (usually production
    // sharing this bot). Deleting it would steal that instance's updates, and
    // their link tokens do not exist in this database.
    const info = await this.telegram.call<{ url: string }>('getWebhookInfo');
    if (info.url) {
      console.warn(
        '[TELEGRAM] webhook ativo em outra instância; long polling desativado. Use outro bot (TELEGRAM_BOT_TOKEN) em desenvolvimento.',
      );
      return;
    }
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
              console.error(
                '[TELEGRAM] falha ao processar update:',
                describeError(err),
              ),
            );
        }
      } catch (err) {
        console.error('[TELEGRAM] getUpdates falhou:', describeError(err));
        // 409: a webhook was set or another instance polls this bot.
        if (err instanceof TelegramApiError && err.status === 409) {
          console.warn('[TELEGRAM] long polling encerrado.');
          this.polling = false;
          return;
        }
        await new Promise((resolve) => setTimeout(resolve, POLL_RETRY_MS));
      }
    }
  }
}
