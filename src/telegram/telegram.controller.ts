import {
  Body,
  Controller,
  Delete,
  Headers,
  HttpCode,
  Post,
  Request,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { SkipThrottle } from '@nestjs/throttler';
import { createHash, timingSafeEqual } from 'crypto';
import { TelegramLinkService } from './telegram-link.service';
import type { TelegramUpdate } from './telegram-link.service';

interface AuthenticatedRequest {
  user: {
    userId: string;
  };
}

function sameSecret(received: string, expected: string): boolean {
  // Hash both sides so timingSafeEqual gets equal-length buffers.
  const a = createHash('sha256').update(received).digest();
  const b = createHash('sha256').update(expected).digest();
  return timingSafeEqual(a, b);
}

@Controller('telegram')
export class TelegramController {
  constructor(private readonly linkService: TelegramLinkService) {}

  @UseGuards(AuthGuard('jwt'))
  @Post('link')
  createLink(@Request() req: AuthenticatedRequest) {
    return this.linkService.createLink(req.user.userId);
  }

  @UseGuards(AuthGuard('jwt'))
  @Delete('link')
  @HttpCode(204)
  unlink(@Request() req: AuthenticatedRequest) {
    return this.linkService.unlink(req.user.userId);
  }

  // All updates come from a handful of Telegram IPs, so the per-IP throttler
  // would drop legitimate traffic. The secret header is the access control.
  @SkipThrottle()
  @Post('webhook')
  @HttpCode(200)
  async webhook(
    @Headers('x-telegram-bot-api-secret-token') secret: string | undefined,
    @Body() update: TelegramUpdate,
  ) {
    const expected = process.env.TELEGRAM_WEBHOOK_SECRET;
    if (!expected || !secret || !sameSecret(secret, expected)) {
      throw new UnauthorizedException();
    }

    try {
      await this.linkService.handleUpdate(update);
    } catch (err) {
      // Telegram retries non-2xx answers; a failing update must not block
      // the queue, so log it and acknowledge.
      console.error('[TELEGRAM] falha ao processar update:', err);
    }
    return { ok: true };
  }
}
