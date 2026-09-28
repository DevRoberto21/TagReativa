import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

interface TelegramApiResponse<T> {
  ok: boolean;
  result?: T;
  description?: string;
}

@Injectable()
export class TelegramService {
  private readonly baseUrl: string;

  constructor(private prisma: PrismaService) {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    if (!token) throw new Error('FATAL: TELEGRAM_BOT_TOKEN não definido.');
    this.baseUrl = `https://api.telegram.org/bot${token}`;
  }

  async sendMessage(chatId: string, text: string): Promise<boolean> {
    return this.deliver(chatId, 'sendMessage', { chat_id: chatId, text });
  }

  async sendLocation(
    chatId: string,
    latitude: number,
    longitude: number,
  ): Promise<boolean> {
    return this.deliver(chatId, 'sendLocation', {
      chat_id: chatId,
      latitude,
      longitude,
    });
  }

  // Raw Bot API call, used for webhook setup and long polling. Throws on
  // network errors and on responses with ok=false.
  async call<T>(method: string, payload: object = {}): Promise<T> {
    const res = await fetch(`${this.baseUrl}/${method}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = (await res.json()) as TelegramApiResponse<T>;
    if (!data.ok) {
      throw new TelegramApiError(res.status, data.description ?? 'unknown');
    }
    return data.result as T;
  }

  private async deliver(
    chatId: string,
    method: string,
    payload: object,
  ): Promise<boolean> {
    try {
      await this.call(method, payload);
      return true;
    } catch (err) {
      console.error(`[TELEGRAM] ${method} falhou:`, err);
      // 403 means the owner blocked the bot or deleted the chat. Unlink so
      // later scans stop trying and the profile shows the channel as off.
      if (err instanceof TelegramApiError && err.status === 403) {
        await this.prisma.user.updateMany({
          where: { telegramChatId: chatId },
          data: { telegramChatId: null, telegramLinkedAt: null },
        });
      }
      return false;
    }
  }
}

export class TelegramApiError extends Error {
  constructor(
    readonly status: number,
    description: string,
  ) {
    super(`Telegram API ${status}: ${description}`);
  }
}
