import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaService } from './prisma/prisma.service';
import { describeError } from './describe-error';

const PURGE_INTERVAL_MS = 6 * 60 * 60 * 1000;
// Recently expired or used rows stay a day for troubleshooting.
const RETENTION_MS = 24 * 60 * 60 * 1000;

// shortcut: the timer runs in every app instance (harmless, deletes are
// idempotent); move to a scheduled job if the API scales out.
@Injectable()
export class TokenCleanupService implements OnModuleInit, OnModuleDestroy {
  private timer?: NodeJS.Timeout;

  constructor(private prisma: PrismaService) {}

  onModuleInit() {
    void this.purge();
    this.timer = setInterval(() => void this.purge(), PURGE_INTERVAL_MS);
    this.timer.unref();
  }

  onModuleDestroy() {
    clearInterval(this.timer);
  }

  async purge(): Promise<void> {
    const cutoff = new Date(Date.now() - RETENTION_MS);
    const where = {
      OR: [{ expiresAt: { lt: cutoff } }, { usedAt: { lt: cutoff } }],
    };
    try {
      await Promise.all([
        this.prisma.twoFactorCode.deleteMany({ where }),
        this.prisma.passwordResetToken.deleteMany({ where }),
        this.prisma.telegramLinkToken.deleteMany({ where }),
      ]);
    } catch (err) {
      console.error('[CLEANUP] falha ao apagar tokens:', describeError(err));
    }
  }
}
