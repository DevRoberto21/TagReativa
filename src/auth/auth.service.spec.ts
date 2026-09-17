import { Test, TestingModule } from '@nestjs/testing';
import { AuthService } from './auth.service';
import { UsersService } from '../users/users.service';
import { PrismaService } from '../prisma/prisma.service';
import { EmailService } from '../email/email.service';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { createHash } from 'crypto';

describe('AuthService', () => {
  let service: AuthService;
  let usersService: { findByEmail: jest.Mock };
  let prisma: {
    passwordResetToken: {
      deleteMany: jest.Mock;
      create: jest.Mock;
      findUnique: jest.Mock;
      update: jest.Mock;
    };
    twoFactorCode: {
      deleteMany: jest.Mock;
      create: jest.Mock;
      findUnique: jest.Mock;
      findFirst: jest.Mock;
      update: jest.Mock;
    };
    user: { update: jest.Mock; findUnique: jest.Mock };
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
      passwordResetToken: {
        deleteMany: jest.fn(),
        create: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      twoFactorCode: {
        deleteMany: jest.fn(),
        create: jest.fn(),
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        update: jest.fn(),
      },
      user: { update: jest.fn(), findUnique: jest.fn() },
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
    it('creates a token and sends an email when the address exists', async () => {
      usersService.findByEmail.mockResolvedValue(existingUser);
      prisma.passwordResetToken.deleteMany.mockResolvedValue({ count: 0 });
      prisma.passwordResetToken.create.mockResolvedValue({});
      emailService.send.mockResolvedValue(true);

      const result = await service.forgotPassword({
        email: 'owner@example.com',
      });

      expect(prisma.passwordResetToken.deleteMany).toHaveBeenCalledWith({
        where: { userId: 'user-1' },
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
        data: { passwordHash: expect.any(String) },
      });
      expect(prisma.passwordResetToken.update).toHaveBeenCalledWith({
        where: { id: 'reset-1' },
        data: { usedAt: expect.any(Date) },
      });
      expect(prisma.passwordResetToken.deleteMany).toHaveBeenCalledWith({
        where: { userId: 'user-1', id: { not: 'reset-1' } },
      });
      expect(result).toEqual({ message: 'Senha redefinida com sucesso.' });
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

    it('returns an access token for a valid, unexpired, unused code', async () => {
      const rightCode = '123456';
      const codeHash = createHash('sha256').update(rightCode).digest('hex');
      prisma.twoFactorCode.findUnique.mockResolvedValue({
        ...pendingCode,
        codeHash,
      });
      prisma.twoFactorCode.update.mockResolvedValue({});
      prisma.user.findUnique.mockResolvedValue(twoFactorUser);

      const result = await service.verifyTwoFactorLogin({
        loginToken: 'raw-login-token',
        code: rightCode,
      });

      expect(result).toEqual({ access_token: 'signed-jwt' });
      expect(prisma.twoFactorCode.update).toHaveBeenCalledWith({
        where: { id: 'tfc-1' },
        data: { usedAt: expect.any(Date) },
      });
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

      expect(prisma.twoFactorCode.update).toHaveBeenCalledWith({
        where: { id: 'tfc-1' },
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
      prisma.twoFactorCode.update.mockResolvedValue({});
      prisma.user.update.mockResolvedValue({});

      const result = await service.confirmTwoFactor('user-1', {
        code: rightCode,
      });

      expect(result).toEqual({ message: '2FA ativado com sucesso.' });
      expect(prisma.twoFactorCode.findFirst).toHaveBeenCalledWith({
        where: { userId: 'user-1', loginTokenHash: null, usedAt: null },
        orderBy: { createdAt: 'desc' },
      });
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        data: { twoFactorEnabled: true },
      });
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
      prisma.user.update.mockResolvedValue({});
      emailService.send.mockResolvedValue(true);

      const result = await service.disableTwoFactor('user-2', {
        password: 'current-password',
      });

      expect(result).toEqual({ message: '2FA desativado com sucesso.' });
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'user-2' },
        data: { twoFactorEnabled: false },
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
});
