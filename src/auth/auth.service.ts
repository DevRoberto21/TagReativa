import {
  Injectable,
  UnauthorizedException,
  BadRequestException,
  NotFoundException,
  ForbiddenException,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Prisma } from '@prisma/client';
import { randomBytes, randomInt, createHash } from 'crypto';
import { UsersService } from '../users/users.service';
import { PrismaService } from '../prisma/prisma.service';
import { EmailService } from '../email/email.service';
import * as bcrypt from 'bcrypt';
import { LoginDto } from './dto/login.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { VerifyTwoFactorDto } from './dto/verify-two-factor.dto';
import { ConfirmTwoFactorDto } from './dto/confirm-two-factor.dto';
import { DisableTwoFactorDto } from './dto/disable-two-factor.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { describeError } from '../describe-error';

const RESET_TOKEN_TTL_MS = 60 * 60 * 1000;
const MAX_LIVE_RESET_TOKENS = 3;
const FORGOT_PASSWORD_GENERIC_MESSAGE =
  'Se esse e-mail existir em nossa base, enviamos um link de recuperação.';
const TWO_FACTOR_CODE_TTL_MS = 5 * 60 * 1000;
const MAX_TWO_FACTOR_ATTEMPTS = 5;
const TWO_FACTOR_GENERIC_ERROR = 'Código inválido ou expirado.';
// The per-code limit alone resets on every password login, so wrong codes are
// also counted per account across challenges.
const MAX_TWO_FACTOR_ACCOUNT_FAILURES = 10;
const TWO_FACTOR_ACCOUNT_LOCK_MS = 15 * 60 * 1000;
const TWO_FACTOR_LOCKED_MESSAGE =
  'Muitas tentativas de verificação. Tente novamente em 15 minutos ou redefina sua senha.';
// Compared against when the email is unknown, so login takes as long as a
// real password check and response time does not reveal registered emails.
// Same cost factor (10) as the hashes created at registration.
const DUMMY_PASSWORD_HASH =
  '$2b$10$KYT6khCw5nh/F37eyTgTMO8ZTWSD4pmLwN4n5GkeObgLEEp2ficim';

@Injectable()
export class AuthService {
  constructor(
    private usersService: UsersService,
    private jwtService: JwtService,
    private prisma: PrismaService,
    private emailService: EmailService,
  ) {
    // Also guards buildQrCodeUrl: AuthService always boots, so production
    // never reaches the localhost fallbacks.
    if (process.env.NODE_ENV === 'production' && !process.env.FRONTEND_URL) {
      throw new Error('FATAL: FRONTEND_URL não definido.');
    }
  }

  async login(
    dto: LoginDto,
  ): Promise<
    { access_token: string } | { twoFactorRequired: true; loginToken: string }
  > {
    const user = await this.usersService.findByEmail(dto.email);
    if (!user) {
      await bcrypt.compare(dto.password, DUMMY_PASSWORD_HASH);
      throw new UnauthorizedException('Credenciais inválidas.');
    }

    const valid = await bcrypt.compare(dto.password, user.passwordHash);
    if (!valid) throw new UnauthorizedException('Credenciais inválidas.');

    if (user.twoFactorEnabled) {
      if (user.twoFactorLockedUntil && user.twoFactorLockedUntil > new Date()) {
        throw new HttpException(
          TWO_FACTOR_LOCKED_MESSAGE,
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }
      const loginToken = await this.issueTwoFactorCode(
        user.id,
        user.email,
        true,
      );
      return { twoFactorRequired: true, loginToken: loginToken! };
    }

    return { access_token: this.signAccessToken(user) };
  }

  // `ver` lets JwtStrategy reject tokens issued before the user's
  // tokenVersion was bumped (e.g. by a password reset).
  private signAccessToken(user: {
    id: string;
    email: string;
    tokenVersion: number;
  }): string {
    return this.jwtService.sign({
      sub: user.id,
      email: user.email,
      ver: user.tokenVersion,
    });
  }

  private async issueTwoFactorCode(
    userId: string,
    email: string,
    forLogin: boolean,
  ): Promise<string | null> {
    await this.prisma.twoFactorCode.deleteMany({
      where: {
        userId,
        loginTokenHash: forLogin ? { not: null } : null,
      },
    });

    const code = randomInt(100000, 1000000).toString();
    const codeHash = createHash('sha256').update(code).digest('hex');
    const expiresAt = new Date(Date.now() + TWO_FACTOR_CODE_TTL_MS);

    let loginToken: string | null = null;
    let loginTokenHash: string | null = null;
    if (forLogin) {
      loginToken = randomBytes(32).toString('hex');
      loginTokenHash = createHash('sha256').update(loginToken).digest('hex');
    }

    await this.prisma.twoFactorCode.create({
      data: { userId, loginTokenHash, codeHash, expiresAt },
    });

    void this.emailService
      .send(
        email,
        'Código de verificação - TagReativa',
        `Seu código de verificação é: ${code}\n\nVálido por 5 minutos. Se você não solicitou isso, ignore este e-mail.`,
      )
      .then((delivered) => {
        if (!delivered) {
          console.error(
            '[AUTH] Falha ao enviar e-mail de código de verificação, usuário',
            userId,
          );
        }
      })
      .catch((err: unknown) => {
        console.error(
          '[AUTH] Erro inesperado no envio do e-mail de código de verificação:',
          describeError(err),
        );
      });

    return loginToken;
  }

  async verifyTwoFactorLogin(
    dto: VerifyTwoFactorDto,
  ): Promise<{ access_token: string }> {
    const loginTokenHash = createHash('sha256')
      .update(dto.loginToken)
      .digest('hex');

    const record = await this.prisma.twoFactorCode.findUnique({
      where: { loginTokenHash },
    });

    const invalid =
      !record ||
      record.usedAt !== null ||
      record.expiresAt < new Date() ||
      record.attempts >= MAX_TWO_FACTOR_ATTEMPTS;

    if (invalid) {
      throw new BadRequestException(TWO_FACTOR_GENERIC_ERROR);
    }

    const codeHash = createHash('sha256').update(dto.code).digest('hex');
    if (codeHash !== record.codeHash) {
      // Conditional increment: parallel guesses cannot push attempts past the
      // limit, and consumption below refuses a code at the limit.
      await this.prisma.twoFactorCode.updateMany({
        where: {
          id: record.id,
          usedAt: null,
          attempts: { lt: MAX_TWO_FACTOR_ATTEMPTS },
        },
        data: { attempts: { increment: 1 } },
      });
      await this.registerTwoFactorFailure(record.userId, record.id);
      throw new BadRequestException(TWO_FACTOR_GENERIC_ERROR);
    }

    const user = await this.prisma.$transaction(async (tx) => {
      await this.consumeTwoFactorCode(tx, record.id);
      return tx.user.update({
        where: { id: record.userId },
        data: { twoFactorFailedAttempts: 0 },
      });
    });

    return { access_token: this.signAccessToken(user) };
  }

  // Marks the code used only if it is still live; a request that loses the
  // race to another one gets the same answer as an invalid code.
  private async consumeTwoFactorCode(
    tx: Prisma.TransactionClient,
    id: string,
  ): Promise<void> {
    const now = new Date();
    const { count } = await tx.twoFactorCode.updateMany({
      where: {
        id,
        usedAt: null,
        expiresAt: { gt: now },
        attempts: { lt: MAX_TWO_FACTOR_ATTEMPTS },
      },
      data: { usedAt: now },
    });
    if (count !== 1) {
      throw new BadRequestException(TWO_FACTOR_GENERIC_ERROR);
    }
  }

  private async registerTwoFactorFailure(
    userId: string,
    codeId: string,
  ): Promise<void> {
    const user = await this.prisma.user.update({
      where: { id: userId },
      data: { twoFactorFailedAttempts: { increment: 1 } },
      select: { twoFactorFailedAttempts: true },
    });
    if (user.twoFactorFailedAttempts < MAX_TWO_FACTOR_ACCOUNT_FAILURES) return;

    await this.prisma.user.update({
      where: { id: userId },
      data: {
        twoFactorFailedAttempts: 0,
        twoFactorLockedUntil: new Date(Date.now() + TWO_FACTOR_ACCOUNT_LOCK_MS),
      },
    });
    // The pending code dies with the lock, so it cannot be guessed further.
    await this.prisma.twoFactorCode.update({
      where: { id: codeId },
      data: { usedAt: new Date() },
    });
  }

  async logout(userId: string): Promise<void> {
    await this.prisma.user.update({
      where: { id: userId },
      data: { tokenVersion: { increment: 1 } },
    });
  }

  async enableTwoFactor(userId: string): Promise<{ message: string }> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('Usuário não encontrado.');

    await this.issueTwoFactorCode(userId, user.email, false);

    return { message: 'Código de confirmação enviado para seu e-mail.' };
  }

  async confirmTwoFactor(
    userId: string,
    dto: ConfirmTwoFactorDto,
  ): Promise<{ message: string; access_token: string }> {
    const record = await this.prisma.twoFactorCode.findFirst({
      where: { userId, loginTokenHash: null, usedAt: null },
      orderBy: { createdAt: 'desc' },
    });

    const invalid =
      !record ||
      record.expiresAt < new Date() ||
      record.attempts >= MAX_TWO_FACTOR_ATTEMPTS;

    if (invalid) {
      throw new BadRequestException(TWO_FACTOR_GENERIC_ERROR);
    }

    const codeHash = createHash('sha256').update(dto.code).digest('hex');
    if (codeHash !== record.codeHash) {
      // Conditional increment: parallel guesses cannot push attempts past the
      // limit, and consumption below refuses a code at the limit.
      await this.prisma.twoFactorCode.updateMany({
        where: {
          id: record.id,
          usedAt: null,
          attempts: { lt: MAX_TWO_FACTOR_ATTEMPTS },
        },
        data: { attempts: { increment: 1 } },
      });
      throw new BadRequestException(TWO_FACTOR_GENERIC_ERROR);
    }

    // Changing 2FA signs out every other session; the returned token keeps
    // this one logged in.
    const updated = await this.prisma.$transaction(async (tx) => {
      await this.consumeTwoFactorCode(tx, record.id);
      return tx.user.update({
        where: { id: userId },
        data: { twoFactorEnabled: true, tokenVersion: { increment: 1 } },
      });
    });

    return {
      message: '2FA ativado com sucesso.',
      access_token: this.signAccessToken(updated),
    };
  }

  async disableTwoFactor(
    userId: string,
    dto: DisableTwoFactorDto,
  ): Promise<{ message: string; access_token: string }> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('Usuário não encontrado.');

    const valid = await bcrypt.compare(dto.password, user.passwordHash);
    if (!valid) throw new UnauthorizedException('Senha incorreta.');

    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: { twoFactorEnabled: false, tokenVersion: { increment: 1 } },
    });

    void this.emailService
      .send(
        user.email,
        'Autenticação de dois fatores desativada - TagReativa',
        'A autenticação de dois fatores da sua conta TagReativa foi desativada. Se você não fez essa alteração, entre em contato imediatamente.',
      )
      .then((delivered) => {
        if (!delivered) {
          console.error(
            '[AUTH] Falha ao enviar e-mail de aviso de desativação de 2FA, usuário',
            user.id,
          );
        }
      })
      .catch((err: unknown) => {
        console.error(
          '[AUTH] Erro inesperado no envio do e-mail de aviso de desativação de 2FA:',
          describeError(err),
        );
      });

    return {
      message: '2FA desativado com sucesso.',
      access_token: this.signAccessToken(updated),
    };
  }

  async forgotPassword(dto: ForgotPasswordDto): Promise<{ message: string }> {
    const user = await this.usersService.findByEmail(dto.email);
    if (!user) return { message: FORGOT_PASSWORD_GENERIC_MESSAGE };

    // Live tokens are kept: deleting them would let anyone who knows the
    // address cancel a link the owner has just received.
    await this.prisma.passwordResetToken.deleteMany({
      where: {
        userId: user.id,
        OR: [{ usedAt: { not: null } }, { expiresAt: { lt: new Date() } }],
      },
    });
    const live = await this.prisma.passwordResetToken.count({
      where: { userId: user.id },
    });
    if (live >= MAX_LIVE_RESET_TOKENS) {
      return { message: FORGOT_PASSWORD_GENERIC_MESSAGE };
    }

    const rawToken = randomBytes(32).toString('hex');
    const tokenHash = createHash('sha256').update(rawToken).digest('hex');
    const expiresAt = new Date(Date.now() + RESET_TOKEN_TTL_MS);

    await this.prisma.passwordResetToken.create({
      data: { userId: user.id, tokenHash, expiresAt },
    });

    const resetUrl = `${process.env.FRONTEND_URL ?? 'http://localhost:5173'}/redefinir-senha?token=${rawToken}`;

    void this.emailService
      .send(
        user.email,
        'Recuperação de senha - TagReativa',
        `Recebemos um pedido para redefinir a senha da sua conta TagReativa. Acesse o link abaixo para criar uma nova senha (válido por 1 hora):\n\n${resetUrl}\n\nSe você não solicitou isso, ignore este e-mail.`,
      )
      .then((delivered) => {
        if (!delivered) {
          console.error(
            '[AUTH] Falha ao enviar e-mail de recuperação de senha, usuário',
            user.id,
          );
        }
      })
      .catch((err: unknown) => {
        console.error(
          '[AUTH] Erro inesperado no envio do e-mail de recuperação de senha:',
          describeError(err),
        );
      });

    return { message: FORGOT_PASSWORD_GENERIC_MESSAGE };
  }

  async resetPassword(dto: ResetPasswordDto): Promise<{ message: string }> {
    const tokenHash = createHash('sha256').update(dto.token).digest('hex');

    const resetToken = await this.prisma.passwordResetToken.findUnique({
      where: { tokenHash },
    });

    const invalid =
      !resetToken ||
      resetToken.usedAt !== null ||
      resetToken.expiresAt < new Date();

    if (invalid) {
      throw new BadRequestException('Link inválido ou expirado.');
    }

    const passwordHash = await bcrypt.hash(dto.newPassword, 10);

    // A password reset also drops the Telegram channel and pending 2FA
    // challenges: nothing issued under the old credentials may outlive them.
    await this.prisma.$transaction(async (tx) => {
      const now = new Date();
      const { count } = await tx.passwordResetToken.updateMany({
        where: { id: resetToken.id, usedAt: null, expiresAt: { gt: now } },
        data: { usedAt: now },
      });
      if (count !== 1) {
        throw new BadRequestException('Link inválido ou expirado.');
      }

      await tx.user.update({
        where: { id: resetToken.userId },
        data: {
          passwordHash,
          tokenVersion: { increment: 1 },
          twoFactorFailedAttempts: 0,
          twoFactorLockedUntil: null,
          telegramChatId: null,
          telegramLinkedAt: null,
        },
      });
      await tx.telegramLinkToken.deleteMany({
        where: { userId: resetToken.userId },
      });
      await tx.twoFactorCode.deleteMany({
        where: { userId: resetToken.userId },
      });
      await tx.passwordResetToken.deleteMany({
        where: { userId: resetToken.userId, id: { not: resetToken.id } },
      });
    });

    return { message: 'Senha redefinida com sucesso.' };
  }

  async changePassword(
    userId: string,
    dto: ChangePasswordDto,
  ): Promise<{ message: string; access_token: string }> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('Usuário não encontrado.');

    // 403 rather than 401: the frontend logs the user out on any 401.
    const valid = await bcrypt.compare(dto.currentPassword, user.passwordHash);
    if (!valid) throw new ForbiddenException('Senha incorreta.');

    const passwordHash = await bcrypt.hash(dto.newPassword, 10);

    // Bumping tokenVersion signs out every other session; the token returned
    // below keeps the one that made the change logged in.
    const [updated] = await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: userId },
        data: {
          passwordHash,
          tokenVersion: { increment: 1 },
          telegramChatId: null,
          telegramLinkedAt: null,
        },
      }),
      this.prisma.telegramLinkToken.deleteMany({ where: { userId } }),
      this.prisma.twoFactorCode.deleteMany({ where: { userId } }),
      this.prisma.passwordResetToken.deleteMany({ where: { userId } }),
    ]);

    // Telegram is optional: only mention it to owners who had it linked.
    const telegramNote = user.telegramChatId
      ? ' Por segurança, os alertas no Telegram foram desativados: reative-os no seu perfil.'
      : '';
    void this.emailService
      .send(
        user.email,
        'Senha alterada - TagReativa',
        `A senha da sua conta TagReativa foi alterada.${telegramNote} Se você não fez essa alteração, redefina sua senha imediatamente pela opção "Esqueci minha senha".`,
      )
      .then((delivered) => {
        if (!delivered) {
          console.error(
            '[AUTH] Falha ao enviar e-mail de aviso de alteração de senha, usuário',
            user.id,
          );
        }
      })
      .catch((err: unknown) => {
        console.error(
          '[AUTH] Erro inesperado no envio do e-mail de aviso de alteração de senha:',
          describeError(err),
        );
      });

    return {
      message: 'Senha alterada com sucesso.',
      access_token: this.signAccessToken(updated),
    };
  }
}
