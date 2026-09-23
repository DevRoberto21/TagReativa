import { UnauthorizedException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { JwtStrategy } from './jwt.strategy';

describe('JwtStrategy', () => {
  let strategy: JwtStrategy;
  let prisma: { user: { findUnique: jest.Mock } };

  beforeEach(() => {
    process.env.JWT_SECRET = 'test-secret';
    prisma = { user: { findUnique: jest.fn() } };
    strategy = new JwtStrategy(prisma as unknown as PrismaService);
  });

  it('accepts a token whose version matches the user', async () => {
    prisma.user.findUnique.mockResolvedValue({ tokenVersion: 2 });

    await expect(
      strategy.validate({ sub: 'user-1', email: 'a@b.com', ver: 2 }),
    ).resolves.toEqual({ userId: 'user-1', email: 'a@b.com' });
    expect(prisma.user.findUnique).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      select: { tokenVersion: true },
    });
  });

  it('rejects a token issued before the version was bumped', async () => {
    prisma.user.findUnique.mockResolvedValue({ tokenVersion: 3 });

    await expect(
      strategy.validate({ sub: 'user-1', email: 'a@b.com', ver: 2 }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('treats a token without a version as version 0', async () => {
    prisma.user.findUnique.mockResolvedValue({ tokenVersion: 0 });
    await expect(
      strategy.validate({ sub: 'user-1', email: 'a@b.com' }),
    ).resolves.toEqual({ userId: 'user-1', email: 'a@b.com' });

    prisma.user.findUnique.mockResolvedValue({ tokenVersion: 1 });
    await expect(
      strategy.validate({ sub: 'user-1', email: 'a@b.com' }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects a token for a user that no longer exists', async () => {
    prisma.user.findUnique.mockResolvedValue(null);

    await expect(
      strategy.validate({ sub: 'gone', email: 'a@b.com', ver: 0 }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });
});
