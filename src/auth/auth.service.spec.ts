import { Test, TestingModule } from '@nestjs/testing';
import { AuthService } from './auth.service';
import { UsersService } from '../users/users.service';
import { PrismaService } from '../prisma/prisma.service';
import { EmailService } from '../email/email.service';
import { JwtService } from '@nestjs/jwt';

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
    user: { update: jest.Mock };
  };
  let emailService: { send: jest.Mock };

  const existingUser = {
    id: 'user-1',
    name: 'Roberto',
    email: 'owner@example.com',
    passwordHash: 'hash',
    whatsapp: '5511999999999',
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
      user: { update: jest.fn() },
    };
    emailService = { send: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: UsersService, useValue: usersService },
        { provide: PrismaService, useValue: prisma },
        { provide: EmailService, useValue: emailService },
        { provide: JwtService, useValue: { sign: jest.fn() } },
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
});
