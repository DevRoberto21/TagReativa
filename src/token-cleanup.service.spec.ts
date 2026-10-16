import { inspect } from 'util';
import { TokenCleanupService } from './token-cleanup.service';
import { PrismaService } from './prisma/prisma.service';

describe('TokenCleanupService', () => {
  const deleteMany = () => jest.fn().mockResolvedValue({ count: 0 });
  let prisma: {
    twoFactorCode: { deleteMany: jest.Mock };
    passwordResetToken: { deleteMany: jest.Mock };
    telegramLinkToken: { deleteMany: jest.Mock };
  };
  let service: TokenCleanupService;

  beforeEach(() => {
    prisma = {
      twoFactorCode: { deleteMany: deleteMany() },
      passwordResetToken: { deleteMany: deleteMany() },
      telegramLinkToken: { deleteMany: deleteMany() },
    };
    service = new TokenCleanupService(prisma as unknown as PrismaService);
  });

  afterEach(() => service.onModuleDestroy());

  it('deletes tokens expired or used more than 24 h ago from every table', async () => {
    const before = Date.now();

    await service.purge();

    for (const model of Object.values(prisma)) {
      type Where = {
        where: { OR: [{ expiresAt: { lt: Date } }, { usedAt: { lt: Date } }] };
      };
      const [[{ where }]] = model.deleteMany.mock.calls as [[Where]];
      const cutoff = where.OR[0].expiresAt.lt.getTime();
      expect(where.OR[1].usedAt.lt.getTime()).toBe(cutoff);
      expect(before - cutoff).toBeGreaterThanOrEqual(24 * 60 * 60 * 1000 - 50);
      expect(before - cutoff).toBeLessThanOrEqual(24 * 60 * 60 * 1000 + 50);
    }
  });

  it('only logs a short message when the purge fails', async () => {
    const log = jest.spyOn(console, 'error').mockImplementation(() => {});
    prisma.passwordResetToken.deleteMany.mockRejectedValue(
      Object.assign(new Error('db down'), { meta: { email: 'a@b.com' } }),
    );

    await expect(service.purge()).resolves.toBeUndefined();

    expect(log).toHaveBeenCalledTimes(1);
    expect(inspect(log.mock.calls, { depth: null })).not.toContain('a@b.com');
    log.mockRestore();
  });

  it('schedules the purge every 6 h without holding the process open', () => {
    const unref = jest.fn();
    const spy = jest
      .spyOn(global, 'setInterval')
      .mockReturnValue({ unref } as unknown as NodeJS.Timeout);

    service.onModuleInit();

    expect(spy).toHaveBeenCalledWith(expect.any(Function), 6 * 60 * 60 * 1000);
    expect(unref).toHaveBeenCalled();
    spy.mockRestore();
  });
});
