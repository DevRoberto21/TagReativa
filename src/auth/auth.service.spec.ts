import { inspect } from 'util';
import { Test, TestingModule } from '@nestjs/testing';
import { AuthService } from './auth.service';
import { UsersService } from '../users/users.service';
import { PrismaService } from '../prisma/prisma.service';
import { EmailService } from '../email/email.service';
import { JwtService } from '@nestjs/jwt';
import { ForbiddenException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { createHash } from 'crypto';

// Wraps the real compare so tests can assert on calls; ES namespace
// exports cannot be redefined by jest.spyOn.
jest.mock('bcrypt', () => {
  const actual = jest.requireActual<typeof import('bcrypt')>('bcrypt');
  return {
    ...actual,
    compare: jest.fn((data: string, encrypted: string) =>
      actual.compare(data, encrypted),
    ),
  };
});

describe('AuthService', () => {
  let service: AuthService;
  let usersService: { findByEmail: jest.Mock };
  let prisma: {
    telegramLinkToken: { deleteMany: jest.Mock };
    passwordResetToken: {
      deleteMany: jest.Mock;
      count: jest.Mock;
      create: jest.Mock;
      findUnique: jest.Mock;
      update: jest.Mock;
      updateMany: jest.Mock;
    };
    twoFactorCode: {
      deleteMany: jest.Mock;
      create: jest.Mock;
      findUnique: jest.Mock;
      findFirst: jest.Mock;
      update: jest.Mock;
      updateMany: jest.Mock;
    };
    user: { update: jest.Mock; findUnique: jest.Mock };
    $transaction: jest.Mock;
  };
  let emailService: { send: jest.Mock };
  let jwtService: { sign: jest.Mock };

  const existingUser = {
    id: 'user-1',
    name: 'Roberto',
    email: 'owner@example.com',
    passwordHash: 'hash',
    whatsapp: '5511999999999',
    twoFactorEnabled: false,
    tokenVersion: 3,
  };

  const twoFactorUser = {
    ...existingUser,
    id: 'user-2',
    email: 'twofactor@example.com',
    twoFactorEnabled: true,
  };

  beforeEach(async () => {
    usersService = { findByEmail: jest.fn() };
    prisma = {
      telegramLinkToken: {
        deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
      passwordResetToken: {
        deleteMany: jest.fn(),
        count: jest.fn().mockResolvedValue(0),
        create: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      twoFactorCode: {
        deleteMany: jest.fn(),
        create: jest.fn(),
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      user: { update: jest.fn(), findUnique: jest.fn() },
      $transaction: jest.fn((arg: unknown) =>
        typeof arg === 'function'
          ? (arg as (tx: unknown) => unknown)(prisma)
          : Promise.all(arg as Promise<unknown>[]),
      ),
    };
    emailService = { send: jest.fn() };
    jwtService = { sign: jest.fn().mockReturnValue('signed-jwt') };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: UsersService, useValue: usersService },
        { provide: PrismaService, useValue: prisma },
        { provide: EmailService, useValue: emailService },
        { provide: JwtService, useValue: jwtService },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
  });

  describe('forgotPassword', () => {
    it('logs the user id, not the address, when the email fails', async () => {
      const log = jest.spyOn(console, 'error').mockImplementation(() => {});
      usersService.findByEmail.mockResolvedValue(existingUser);
      prisma.passwordResetToken.deleteMany.mockResolvedValue({ count: 0 });
      prisma.passwordResetToken.create.mockResolvedValue({});
      emailService.send.mockResolvedValue(false);

      await service.forgotPassword({ email: 'owner@example.com' });
      await new Promise(setImmediate);

      const logged = inspect(log.mock.calls, { depth: null });
      expect(logged).toContain('user-1');
      expect(logged).not.toContain('owner@example.com');
      log.mockRestore();
    });

    it('stops issuing links once the account has 3 live tokens', async () => {
      usersService.findByEmail.mockResolvedValue(existingUser);
      prisma.passwordResetToken.deleteMany.mockResolvedValue({ count: 0 });
      prisma.passwordResetToken.count.mockResolvedValue(3);

      const result = await service.forgotPassword({
        email: 'owner@example.com',
      });

      expect(prisma.passwordResetToken.count).toHaveBeenCalledWith({
        where: { userId: 'user-1' },
      });
      expect(prisma.passwordResetToken.create).not.toHaveBeenCalled();
      expect(emailService.send).not.toHaveBeenCalled();
      expect(result).toEqual({
        message:
          'Se esse e-mail existir em nossa base, enviamos um link de recuperação.',
      });
    });

    it('creates a token and sends an email when the address exists', async () => {
      usersService.findByEmail.mockResolvedValue(existingUser);
      prisma.passwordResetToken.deleteMany.mockResolvedValue({ count: 0 });
      prisma.passwordResetToken.create.mockResolvedValue({});
      emailService.send.mockResolvedValue(true);

      const result = await service.forgotPassword({
        email: 'owner@example.com',
      });

      expect(prisma.passwordResetToken.deleteMany).toHaveBeenCalledWith({
        where: {
          userId: 'user-1',
          OR: [
            { usedAt: { not: null } },
            { expiresAt: { lt: expect.any(Date) as Date } },
          ],
        },
      });
      expect(prisma.passwordResetToken.create).toHaveBeenCalledTimes(1);
      const createArgs = prisma.passwordResetToken.create.mock.calls[0][0];
      expect(createArgs.data.userId).toBe('user-1');
      expect(typeof createArgs.data.tokenHash).toBe('string');
      expect(createArgs.data.tokenHash).toHaveLength(64);
      expect(createArgs.data.expiresAt).toBeInstanceOf(Date);

      expect(emailService.send).toHaveBeenCalledTimes(1);
      const [to, subject, message] = emailService.send.mock.calls[0];
      expect(to).toBe('owner@example.com');
      expect(subject).toMatch(/recuperação/i);
      expect(message).toContain('/redefinir-senha?token=');

      expect(result).toEqual({
        message:
          'Se esse e-mail existir em nossa base, enviamos um link de recuperação.',
      });
    });

    it('does not wait for the email send to complete before returning (timing side-channel guard)', async () => {
      usersService.findByEmail.mockResolvedValue(existingUser);
      prisma.passwordResetToken.deleteMany.mockResolvedValue({ count: 0 });
      prisma.passwordResetToken.create.mockResolvedValue({});
      emailService.send.mockReturnValue(new Promise(() => {})); // never resolves

      const result = await service.forgotPassword({
        email: 'owner@example.com',
      });

      expect(result).toEqual({
        message:
          'Se esse e-mail existir em nossa base, enviamos um link de recuperação.',
      });
    });

    it('does nothing but still returns the generic message when the email does not exist', async () => {
      usersService.findByEmail.mockResolvedValue(null);

      const result = await service.forgotPassword({
        email: 'nobody@example.com',
      });

      expect(prisma.passwordResetToken.deleteMany).not.toHaveBeenCalled();
      expect(prisma.passwordResetToken.create).not.toHaveBeenCalled();
      expect(emailService.send).not.toHaveBeenCalled();
      expect(result).toEqual({
        message:
          'Se esse e-mail existir em nossa base, enviamos um link de recuperação.',
      });
    });
  });

  describe('resetPassword', () => {
    const validToken = {
      id: 'reset-1',
      userId: 'user-1',
      tokenHash: '0'.repeat(64), // exact value is irrelevant: resetPassword() never reads this field back, it only computes its own hash from the input token to build the findUnique lookup
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      usedAt: null as Date | null,
      createdAt: new Date(),
    };

    it('updates the password and marks the token used for a valid token', async () => {
      prisma.passwordResetToken.findUnique.mockResolvedValue(validToken);
      prisma.user.update.mockResolvedValue({});
      prisma.passwordResetToken.update.mockResolvedValue({});
      prisma.passwordResetToken.deleteMany.mockResolvedValue({ count: 0 });

      const result = await service.resetPassword({
        token: 'raw-token-value',
        newPassword: 'newpass123',
      });

      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        data: {
          passwordHash: expect.any(String),
          tokenVersion: { increment: 1 },
          twoFactorFailedAttempts: 0,
          twoFactorLockedUntil: null,
          telegramChatId: null,
          telegramLinkedAt: null,
        },
      });
      expect(prisma.telegramLinkToken.deleteMany).toHaveBeenCalledWith({
        where: { userId: 'user-1' },
      });
      expect(prisma.passwordResetToken.updateMany).toHaveBeenCalledWith({
        where: {
          id: 'reset-1',
          usedAt: null,
          expiresAt: { gt: expect.any(Date) as Date },
        },
        data: { usedAt: expect.any(Date) as Date },
      });
      expect(prisma.passwordResetToken.deleteMany).toHaveBeenCalledWith({
        where: { userId: 'user-1', id: { not: 'reset-1' } },
      });
      expect(prisma.twoFactorCode.deleteMany).toHaveBeenCalledWith({
        where: { userId: 'user-1' },
      });
      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      expect(result).toEqual({ message: 'Senha redefinida com sucesso.' });
    });

    it('throws a generic error when a concurrent reset consumed the token first', async () => {
      prisma.passwordResetToken.findUnique.mockResolvedValue(validToken);
      prisma.passwordResetToken.updateMany.mockResolvedValue({ count: 0 });

      await expect(
        service.resetPassword({ token: 'raced', newPassword: 'newpass123' }),
      ).rejects.toThrow('Link inválido ou expirado.');
      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it('throws a generic error for an unknown token', async () => {
      prisma.passwordResetToken.findUnique.mockResolvedValue(null);

      await expect(
        service.resetPassword({ token: 'bogus', newPassword: 'newpass123' }),
      ).rejects.toThrow('Link inválido ou expirado.');
      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it('throws a generic error for an expired token', async () => {
      prisma.passwordResetToken.findUnique.mockResolvedValue({
        ...validToken,
        expiresAt: new Date(Date.now() - 1000),
      });

      await expect(
        service.resetPassword({ token: 'expired', newPassword: 'newpass123' }),
      ).rejects.toThrow('Link inválido ou expirado.');
      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it('throws a generic error for an already-used token', async () => {
      prisma.passwordResetToken.findUnique.mockResolvedValue({
        ...validToken,
        usedAt: new Date(),
      });

      await expect(
        service.resetPassword({ token: 'used', newPassword: 'newpass123' }),
      ).rejects.toThrow('Link inválido ou expirado.');
      expect(prisma.user.update).not.toHaveBeenCalled();
    });
  });

  describe('login', () => {
    it('returns an access token directly when 2FA is disabled', async () => {
      const passwordHash = await bcrypt.hash('correct-password', 10);
      usersService.findByEmail.mockResolvedValue({
        ...existingUser,
        passwordHash,
      });

      const result = await service.login({
        email: 'owner@example.com',
        password: 'correct-password',
      });

      expect(result).toEqual({ access_token: 'signed-jwt' });
      expect(jwtService.sign).toHaveBeenCalledWith({
        sub: 'user-1',
        email: 'owner@example.com',
        ver: 3,
      });
      expect(prisma.twoFactorCode.create).not.toHaveBeenCalled();
      expect(emailService.send).not.toHaveBeenCalled();
    });

    it('issues a 2FA code and withholds the access token when 2FA is enabled', async () => {
      const passwordHash = await bcrypt.hash('correct-password', 10);
      usersService.findByEmail.mockResolvedValue({
        ...twoFactorUser,
        passwordHash,
      });
      prisma.twoFactorCode.deleteMany.mockResolvedValue({ count: 0 });
      prisma.twoFactorCode.create.mockResolvedValue({});
      emailService.send.mockResolvedValue(true);

      const result = await service.login({
        email: 'twofactor@example.com',
        password: 'correct-password',
      });

      expect(result).toEqual({
        twoFactorRequired: true,
        loginToken: expect.any(String),
      });
      expect((result as { loginToken: string }).loginToken).toHaveLength(64);

      expect(prisma.twoFactorCode.deleteMany).toHaveBeenCalledWith({
        where: { userId: 'user-2', loginTokenHash: { not: null } },
      });
      expect(prisma.twoFactorCode.create).toHaveBeenCalledTimes(1);
      const createArgs = prisma.twoFactorCode.create.mock.calls[0][0];
      expect(createArgs.data.userId).toBe('user-2');
      expect(typeof createArgs.data.loginTokenHash).toBe('string');
      expect(createArgs.data.loginTokenHash).toHaveLength(64);
      expect(typeof createArgs.data.codeHash).toBe('string');
      expect(createArgs.data.codeHash).toHaveLength(64);

      expect(emailService.send).toHaveBeenCalledTimes(1);
      const [to, subject, message] = emailService.send.mock.calls[0];
      expect(to).toBe('twofactor@example.com');
      expect(subject).toMatch(/verificação/i);
      expect(message).toMatch(/\d{6}/);
    });

    it('rejects an incorrect password without issuing a 2FA code, even when 2FA is enabled', async () => {
      const passwordHash = await bcrypt.hash('correct-password', 10);
      usersService.findByEmail.mockResolvedValue({
        ...twoFactorUser,
        passwordHash,
      });

      await expect(
        service.login({ email: 'twofactor@example.com', password: 'wrong' }),
      ).rejects.toThrow('Credenciais inválidas.');
      expect(prisma.twoFactorCode.create).not.toHaveBeenCalled();
      expect(emailService.send).not.toHaveBeenCalled();
    });

    it('still runs a bcrypt comparison for an unknown email (timing side-channel guard)', async () => {
      usersService.findByEmail.mockResolvedValue(null);
      const compare = bcrypt.compare as jest.Mock;
      compare.mockClear();

      await expect(
        service.login({ email: 'nobody@example.com', password: 'whatever' }),
      ).rejects.toThrow('Credenciais inválidas.');
      expect(compare).toHaveBeenCalledWith(
        'whatever',
        expect.stringMatching(/^\$2[aby]\$10\$/),
      );
    });

    it('refuses to issue a 2FA code while the account is locked', async () => {
      const passwordHash = await bcrypt.hash('correct-password', 10);
      usersService.findByEmail.mockResolvedValue({
        ...twoFactorUser,
        passwordHash,
        twoFactorLockedUntil: new Date(Date.now() + 60_000),
      });

      await expect(
        service.login({
          email: 'twofactor@example.com',
          password: 'correct-password',
        }),
      ).rejects.toMatchObject({ status: 429 });
      expect(prisma.twoFactorCode.create).not.toHaveBeenCalled();
      expect(emailService.send).not.toHaveBeenCalled();
    });

    it('issues a 2FA code again once the lock has expired', async () => {
      const passwordHash = await bcrypt.hash('correct-password', 10);
      usersService.findByEmail.mockResolvedValue({
        ...twoFactorUser,
        passwordHash,
        twoFactorLockedUntil: new Date(Date.now() - 1000),
      });
      prisma.twoFactorCode.deleteMany.mockResolvedValue({ count: 0 });
      prisma.twoFactorCode.create.mockResolvedValue({});
      emailService.send.mockResolvedValue(true);

      const result = await service.login({
        email: 'twofactor@example.com',
        password: 'correct-password',
      });

      expect(result).toMatchObject({ twoFactorRequired: true });
      expect(prisma.twoFactorCode.create).toHaveBeenCalledTimes(1);
    });
  });

  describe('verifyTwoFactorLogin', () => {
    const pendingCode = {
      id: 'tfc-1',
      userId: 'user-2',
      loginTokenHash: '1'.repeat(64),
      codeHash: '',
      expiresAt: new Date(Date.now() + 5 * 60 * 1000),
      attempts: 0,
      usedAt: null as Date | null,
      createdAt: new Date(),
    };

    beforeEach(() => {
      prisma.user.update.mockResolvedValue({ twoFactorFailedAttempts: 1 });
    });

    it('counts a wrong code against the account, not only the challenge', async () => {
      const codeHash = createHash('sha256').update('999999').digest('hex');
      prisma.twoFactorCode.findUnique.mockResolvedValue({
        ...pendingCode,
        codeHash,
      });
      prisma.twoFactorCode.update.mockResolvedValue({ attempts: 1 });

      await expect(
        service.verifyTwoFactorLogin({ loginToken: 'raw', code: '111111' }),
      ).rejects.toThrow('Código inválido ou expirado.');

      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'user-2' },
        data: { twoFactorFailedAttempts: { increment: 1 } },
        select: { twoFactorFailedAttempts: true },
      });
    });

    it('locks the account after 10 wrong codes across challenges', async () => {
      const codeHash = createHash('sha256').update('999999').digest('hex');
      prisma.twoFactorCode.findUnique.mockResolvedValue({
        ...pendingCode,
        codeHash,
      });
      prisma.twoFactorCode.update.mockResolvedValue({ attempts: 1 });
      prisma.user.update
        .mockReset()
        .mockResolvedValueOnce({ twoFactorFailedAttempts: 10 })
        .mockResolvedValueOnce({});

      await expect(
        service.verifyTwoFactorLogin({ loginToken: 'raw', code: '111111' }),
      ).rejects.toThrow('Código inválido ou expirado.');

      expect(prisma.user.update).toHaveBeenLastCalledWith({
        where: { id: 'user-2' },
        data: {
          twoFactorFailedAttempts: 0,
          twoFactorLockedUntil: expect.any(Date) as Date,
        },
      });
      expect(prisma.twoFactorCode.update).toHaveBeenLastCalledWith({
        where: { id: 'tfc-1' },
        data: { usedAt: expect.any(Date) as Date },
      });
    });

    it('clears the account failure counter on a correct code', async () => {
      const codeHash = createHash('sha256').update('123456').digest('hex');
      prisma.twoFactorCode.findUnique.mockResolvedValue({
        ...pendingCode,
        codeHash,
      });
      prisma.twoFactorCode.update.mockResolvedValue({});
      prisma.user.findUnique.mockResolvedValue({
        ...twoFactorUser,
        twoFactorFailedAttempts: 4,
      });

      await service.verifyTwoFactorLogin({ loginToken: 'raw', code: '123456' });

      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'user-2' },
        data: { twoFactorFailedAttempts: 0 },
      });
    });

    it('returns an access token for a valid, unexpired, unused code', async () => {
      const rightCode = '123456';
      const codeHash = createHash('sha256').update(rightCode).digest('hex');
      prisma.twoFactorCode.findUnique.mockResolvedValue({
        ...pendingCode,
        codeHash,
      });
      prisma.user.update.mockResolvedValue(twoFactorUser);

      const result = await service.verifyTwoFactorLogin({
        loginToken: 'raw-login-token',
        code: rightCode,
      });

      expect(result).toEqual({ access_token: 'signed-jwt' });
      expect(jwtService.sign).toHaveBeenCalledWith({
        sub: 'user-2',
        email: 'twofactor@example.com',
        ver: 3,
      });
      expect(prisma.twoFactorCode.updateMany).toHaveBeenCalledWith({
        where: {
          id: 'tfc-1',
          usedAt: null,
          expiresAt: { gt: expect.any(Date) as Date },
          attempts: { lt: 5 },
        },
        data: { usedAt: expect.any(Date) as Date },
      });
    });

    it('rejects a right code when a concurrent request consumed it first', async () => {
      const codeHash = createHash('sha256').update('123456').digest('hex');
      prisma.twoFactorCode.findUnique.mockResolvedValue({
        ...pendingCode,
        codeHash,
      });
      prisma.twoFactorCode.updateMany.mockResolvedValue({ count: 0 });

      await expect(
        service.verifyTwoFactorLogin({ loginToken: 'raw', code: '123456' }),
      ).rejects.toThrow('Código inválido ou expirado.');
      expect(prisma.user.update).not.toHaveBeenCalled();
      expect(jwtService.sign).not.toHaveBeenCalled();
    });

    it('throws a generic error and increments attempts for a wrong code', async () => {
      const codeHash = createHash('sha256').update('999999').digest('hex');
      prisma.twoFactorCode.findUnique.mockResolvedValue({
        ...pendingCode,
        codeHash,
      });
      prisma.twoFactorCode.update.mockResolvedValue({});

      await expect(
        service.verifyTwoFactorLogin({ loginToken: 'raw', code: '111111' }),
      ).rejects.toThrow('Código inválido ou expirado.');

      expect(prisma.twoFactorCode.updateMany).toHaveBeenCalledWith({
        where: { id: 'tfc-1', usedAt: null, attempts: { lt: 5 } },
        data: { attempts: { increment: 1 } },
      });
    });

    it('throws a generic error for an expired code', async () => {
      prisma.twoFactorCode.findUnique.mockResolvedValue({
        ...pendingCode,
        expiresAt: new Date(Date.now() - 1000),
      });

      await expect(
        service.verifyTwoFactorLogin({ loginToken: 'raw', code: '123456' }),
      ).rejects.toThrow('Código inválido ou expirado.');
      expect(prisma.user.findUnique).not.toHaveBeenCalled();
    });

    it('throws a generic error once attempts reach the limit, even with the right code', async () => {
      const rightCode = '123456';
      const codeHash = createHash('sha256').update(rightCode).digest('hex');
      prisma.twoFactorCode.findUnique.mockResolvedValue({
        ...pendingCode,
        codeHash,
        attempts: 5,
      });

      await expect(
        service.verifyTwoFactorLogin({ loginToken: 'raw', code: rightCode }),
      ).rejects.toThrow('Código inválido ou expirado.');
      expect(prisma.user.findUnique).not.toHaveBeenCalled();
    });
  });

  describe('enableTwoFactor', () => {
    it('issues an enable-confirmation code (no loginToken) and does not flip the flag yet', async () => {
      prisma.user.findUnique.mockResolvedValue(existingUser);
      prisma.twoFactorCode.deleteMany.mockResolvedValue({ count: 0 });
      prisma.twoFactorCode.create.mockResolvedValue({});
      emailService.send.mockResolvedValue(true);

      const result = await service.enableTwoFactor('user-1');

      expect(result).toEqual({
        message: 'Código de confirmação enviado para seu e-mail.',
      });
      expect(prisma.twoFactorCode.deleteMany).toHaveBeenCalledWith({
        where: { userId: 'user-1', loginTokenHash: null },
      });
      const createArgs = prisma.twoFactorCode.create.mock.calls[0][0];
      expect(createArgs.data.loginTokenHash).toBeNull();
      expect(emailService.send).toHaveBeenCalledTimes(1);
    });
  });

  describe('confirmTwoFactor', () => {
    const pendingEnableCode = {
      id: 'tfc-enable-1',
      userId: 'user-1',
      loginTokenHash: null as string | null,
      codeHash: '',
      expiresAt: new Date(Date.now() + 5 * 60 * 1000),
      attempts: 0,
      usedAt: null as Date | null,
      createdAt: new Date(),
    };

    it('flips twoFactorEnabled to true for a valid code', async () => {
      const rightCode = '654321';
      const codeHash = createHash('sha256').update(rightCode).digest('hex');
      prisma.twoFactorCode.findFirst.mockResolvedValue({
        ...pendingEnableCode,
        codeHash,
      });
      prisma.user.update.mockResolvedValue({
        ...existingUser,
        tokenVersion: 4,
      });

      const result = await service.confirmTwoFactor('user-1', {
        code: rightCode,
      });

      expect(result).toEqual({
        message: '2FA ativado com sucesso.',
        access_token: 'signed-jwt',
      });
      expect(jwtService.sign).toHaveBeenCalledWith({
        sub: 'user-1',
        email: 'owner@example.com',
        ver: 4,
      });
      expect(prisma.twoFactorCode.findFirst).toHaveBeenCalledWith({
        where: { userId: 'user-1', loginTokenHash: null, usedAt: null },
        orderBy: { createdAt: 'desc' },
      });
      expect(prisma.twoFactorCode.updateMany).toHaveBeenCalledWith({
        where: {
          id: 'tfc-enable-1',
          usedAt: null,
          expiresAt: { gt: expect.any(Date) as Date },
          attempts: { lt: 5 },
        },
        data: { usedAt: expect.any(Date) as Date },
      });
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        data: { twoFactorEnabled: true, tokenVersion: { increment: 1 } },
      });
    });

    it('leaves the flag unchanged when a concurrent request consumed the code first', async () => {
      const codeHash = createHash('sha256').update('654321').digest('hex');
      prisma.twoFactorCode.findFirst.mockResolvedValue({
        ...pendingEnableCode,
        codeHash,
      });
      prisma.twoFactorCode.updateMany.mockResolvedValue({ count: 0 });

      await expect(
        service.confirmTwoFactor('user-1', { code: '654321' }),
      ).rejects.toThrow('Código inválido ou expirado.');
      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it('throws a generic error and leaves the flag unchanged for a wrong code', async () => {
      const codeHash = createHash('sha256').update('000000').digest('hex');
      prisma.twoFactorCode.findFirst.mockResolvedValue({
        ...pendingEnableCode,
        codeHash,
      });
      prisma.twoFactorCode.update.mockResolvedValue({});

      await expect(
        service.confirmTwoFactor('user-1', { code: '111111' }),
      ).rejects.toThrow('Código inválido ou expirado.');
      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it('throws a generic error for an expired code', async () => {
      prisma.twoFactorCode.findFirst.mockResolvedValue({
        ...pendingEnableCode,
        expiresAt: new Date(Date.now() - 1000),
      });

      await expect(
        service.confirmTwoFactor('user-1', { code: '123456' }),
      ).rejects.toThrow('Código inválido ou expirado.');
      expect(prisma.user.update).not.toHaveBeenCalled();
    });
  });

  describe('disableTwoFactor', () => {
    it('flips twoFactorEnabled to false and notifies by email for the correct password', async () => {
      const passwordHash = await bcrypt.hash('current-password', 10);
      prisma.user.findUnique.mockResolvedValue({
        ...twoFactorUser,
        passwordHash,
      });
      prisma.user.update.mockResolvedValue({
        ...twoFactorUser,
        tokenVersion: 4,
      });
      emailService.send.mockResolvedValue(true);

      const result = await service.disableTwoFactor('user-2', {
        password: 'current-password',
      });

      expect(result).toEqual({
        message: '2FA desativado com sucesso.',
        access_token: 'signed-jwt',
      });
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'user-2' },
        data: { twoFactorEnabled: false, tokenVersion: { increment: 1 } },
      });
      expect(jwtService.sign).toHaveBeenCalledWith({
        sub: 'user-2',
        email: 'twofactor@example.com',
        ver: 4,
      });
      expect(emailService.send).toHaveBeenCalledTimes(1);
      const [to, subject] = emailService.send.mock.calls[0];
      expect(to).toBe('twofactor@example.com');
      expect(subject).toMatch(/desativada/i);
    });

    it('throws for an incorrect password and leaves the flag unchanged', async () => {
      const passwordHash = await bcrypt.hash('current-password', 10);
      prisma.user.findUnique.mockResolvedValue({
        ...twoFactorUser,
        passwordHash,
      });

      await expect(
        service.disableTwoFactor('user-2', { password: 'wrong' }),
      ).rejects.toThrow('Senha incorreta.');
      expect(prisma.user.update).not.toHaveBeenCalled();
      expect(emailService.send).not.toHaveBeenCalled();
    });
  });

  describe('changePassword', () => {
    beforeEach(async () => {
      prisma.user.findUnique.mockResolvedValue({
        ...existingUser,
        passwordHash: await bcrypt.hash('current-pass1', 10),
      });
      prisma.user.update.mockResolvedValue({
        ...existingUser,
        tokenVersion: 4,
      });
      emailService.send.mockResolvedValue(true);
    });

    it('stores the new password hash and bumps tokenVersion for the correct current password', async () => {
      await service.changePassword('user-1', {
        currentPassword: 'current-pass1',
        newPassword: 'brand-new2',
      });

      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        data: {
          passwordHash: expect.any(String) as string,
          tokenVersion: { increment: 1 },
          telegramChatId: null,
          telegramLinkedAt: null,
        },
      });
      expect(prisma.telegramLinkToken.deleteMany).toHaveBeenCalledWith({
        where: { userId: 'user-1' },
      });
      expect(prisma.twoFactorCode.deleteMany).toHaveBeenCalledWith({
        where: { userId: 'user-1' },
      });
      expect(prisma.passwordResetToken.deleteMany).toHaveBeenCalledWith({
        where: { userId: 'user-1' },
      });
      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      const [{ data }] = prisma.user.update.mock.calls[0] as [
        { data: { passwordHash: string } },
      ];
      expect(await bcrypt.compare('brand-new2', data.passwordHash)).toBe(true);
    });

    it('returns an access token signed with the bumped tokenVersion so the current session survives', async () => {
      const result = await service.changePassword('user-1', {
        currentPassword: 'current-pass1',
        newPassword: 'brand-new2',
      });

      expect(result).toEqual({
        message: 'Senha alterada com sucesso.',
        access_token: 'signed-jwt',
      });
      expect(jwtService.sign).toHaveBeenCalledWith({
        sub: 'user-1',
        email: 'owner@example.com',
        ver: 4,
      });
    });

    it('notifies the owner by email', async () => {
      await service.changePassword('user-1', {
        currentPassword: 'current-pass1',
        newPassword: 'brand-new2',
      });

      expect(emailService.send).toHaveBeenCalledTimes(1);
      const [to, subject] = emailService.send.mock.calls[0] as [string, string];
      expect(to).toBe('owner@example.com');
      expect(subject).toMatch(/senha alterada/i);
    });

    it.each([
      ['mentions', '42', true],
      ['omits', null, false],
    ])(
      '%s Telegram in the email depending on whether it was linked',
      async (_case, telegramChatId, mentioned) => {
        prisma.user.findUnique.mockResolvedValue({
          ...existingUser,
          telegramChatId,
          passwordHash: await bcrypt.hash('current-pass1', 10),
        });

        await service.changePassword('user-1', {
          currentPassword: 'current-pass1',
          newPassword: 'brand-new2',
        });

        const [, , message] = emailService.send.mock.calls[0] as [
          string,
          string,
          string,
        ];
        expect(message.includes('Telegram')).toBe(mentioned);
      },
    );

    it('rejects a wrong current password with 403 and keeps the password', async () => {
      await expect(
        service.changePassword('user-1', {
          currentPassword: 'wrong-pass1',
          newPassword: 'brand-new2',
        }),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(prisma.user.update).not.toHaveBeenCalled();
      expect(emailService.send).not.toHaveBeenCalled();
    });
  });

  describe('logout', () => {
    it('bumps tokenVersion so every issued token stops working', async () => {
      prisma.user.update.mockResolvedValue({});

      await service.logout('user-1');

      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        data: { tokenVersion: { increment: 1 } },
      });
    });
  });
});

describe('AuthService config', () => {
  const env = { ...process.env };
  afterEach(() => {
    process.env = { ...env };
  });

  const build = () =>
    new AuthService(
      {} as UsersService,
      {} as JwtService,
      {} as PrismaService,
      {} as EmailService,
    );

  it('fails to start in production without FRONTEND_URL', () => {
    process.env.NODE_ENV = 'production';
    delete process.env.FRONTEND_URL;
    expect(build).toThrow('FRONTEND_URL');
  });

  it('starts outside production without FRONTEND_URL', () => {
    process.env.NODE_ENV = 'development';
    delete process.env.FRONTEND_URL;
    expect(build).not.toThrow();
  });
});
