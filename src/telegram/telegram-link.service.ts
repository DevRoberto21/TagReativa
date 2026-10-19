import { Injectable } from '@nestjs/common';
import { randomBytes, createHash } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { TelegramService } from './telegram.service';

const LINK_TOKEN_TTL_MS = 15 * 60 * 1000;

// Subset of the Bot API Update object that the bot reacts to.
export interface TelegramUpdate {
  update_id: number;
  message?: {
    chat: { id: number; type: string };
    text?: string;
  };
}

const LINK_EXPIRED_MESSAGE =
  'Este link expirou ou já foi usado. Gere um novo no seu perfil da TagReativa.';

const ALREADY_LINKED_MESSAGE =
  '✅ Seu Telegram já está vinculado à sua conta da TagReativa. Os alertas estão ativos.';

const UNLINKED = { telegramChatId: null, telegramLinkedAt: null };

@Injectable()
export class TelegramLinkService {
  constructor(
    private prisma: PrismaService,
    private telegram: TelegramService,
  ) {
    if (
      process.env.NODE_ENV === 'production' &&
      !process.env.TELEGRAM_BOT_USERNAME
    ) {
      throw new Error('FATAL: TELEGRAM_BOT_USERNAME não definido.');
    }
  }

  async createLink(userId: string): Promise<{ url: string }> {
    // base64url of 32 bytes is 43 chars, inside the 64-char limit Telegram
    // puts on the start parameter, and uses only allowed characters.
    const token = randomBytes(32).toString('base64url');
    const tokenHash = createHash('sha256').update(token).digest('hex');

    // Also purge every used or expired token, so the table does not grow.
    await this.prisma.telegramLinkToken.deleteMany({
      where: {
        OR: [
          { userId, usedAt: null },
          { usedAt: { not: null } },
          { expiresAt: { lt: new Date() } },
        ],
      },
    });
    await this.prisma.telegramLinkToken.create({
      data: {
        userId,
        tokenHash,
        expiresAt: new Date(Date.now() + LINK_TOKEN_TTL_MS),
      },
    });

    const bot = process.env.TELEGRAM_BOT_USERNAME;
    return { url: `https://t.me/${bot}?start=${token}` };
  }

  async unlink(userId: string): Promise<void> {
    await this.prisma.user.update({ where: { id: userId }, data: UNLINKED });
    await this.prisma.telegramLinkToken.deleteMany({ where: { userId } });
  }

  async handleUpdate(update: TelegramUpdate): Promise<void> {
    const message = update.message;
    if (!message?.text || message.chat.type !== 'private') return;

    const chatId = String(message.chat.id);
    const [command, token] = message.text.trim().split(/\s+/);

    if (command === '/start') {
      if (token) await this.link(chatId, token);
      else
        await this.telegram.sendMessage(
          chatId,
          'Para ativar os alertas, abra seu perfil no site da TagReativa e toque em "Ativar no Telegram".',
        );
      return;
    }

    if (command === '/stop') {
      await this.prisma.user.updateMany({
        where: { telegramChatId: chatId },
        data: UNLINKED,
      });
      await this.telegram.sendMessage(
        chatId,
        'Alertas desativados. Para reativar, use o seu perfil no site da TagReativa.',
      );
    }
  }

  private async link(chatId: string, token: string): Promise<void> {
    const tokenHash = createHash('sha256').update(token).digest('hex');
    const record = await this.prisma.telegramLinkToken.findUnique({
      where: { tokenHash },
    });

    if (!record || record.usedAt || record.expiresAt < new Date()) {
      // Opening the same link twice (app plus fallback link, or tapping
      // Start again) is not an error when this chat already got linked.
      const alreadyLinked =
        record?.usedAt &&
        (await this.prisma.user.findFirst({
          where: { id: record.userId, telegramChatId: chatId },
          select: { id: true },
        }));
      await this.telegram.sendMessage(
        chatId,
        alreadyLinked ? ALREADY_LINKED_MESSAGE : LINK_EXPIRED_MESSAGE,
      );
      return;
    }

    // A chat that already belongs to another account is never moved by a
    // link alone: whoever sent the link may not be who owns the chat. The
    // chat owner releases it first with /stop. The token stays unused.
    const holder = await this.prisma.user.findFirst({
      where: { telegramChatId: chatId, NOT: { id: record.userId } },
      select: { id: true },
    });
    if (holder) {
      await this.telegram.sendMessage(
        chatId,
        'Este Telegram já está vinculado a outra conta da TagReativa. Para trocar de conta, envie /stop aqui e depois abra o link novamente.',
      );
      return;
    }

    const now = new Date();
    const user = await this.prisma.$transaction(async (tx) => {
      // Only one /start may consume the token, even when two race.
      const { count } = await tx.telegramLinkToken.updateMany({
        where: { id: record.id, usedAt: null, expiresAt: { gt: now } },
        data: { usedAt: now },
      });
      if (count !== 1) return null;
      return tx.user.update({
        where: { id: record.userId },
        data: { telegramChatId: chatId, telegramLinkedAt: now },
        select: { name: true },
      });
    });

    if (!user) {
      await this.telegram.sendMessage(chatId, LINK_EXPIRED_MESSAGE);
      return;
    }

    await this.telegram.sendMessage(
      chatId,
      `✅ Alertas ativados, ${user.name}! Você receberá um aviso aqui sempre que a tag de um pet perdido seu for escaneada.`,
    );
  }
}
