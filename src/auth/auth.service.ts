import { Injectable, UnauthorizedException, BadRequestException, NotFoundException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
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

const RESET_TOKEN_TTL_MS = 60 * 60 * 1000;
const FORGOT_PASSWORD_GENERIC_MESSAGE =
  'Se esse e-mail existir em nossa base, enviamos um link de recuperação.';
const TWO_FACTOR_CODE_TTL_MS = 5 * 60 * 1000;
const MAX_TWO_FACTOR_ATTEMPTS = 5;
const TWO_FACTOR_GENERIC_ERROR = 'Código inválido ou expirado.';

@Injectable()
export class AuthService {
  constructor(
    private usersService: UsersService,
    private jwtService: JwtService,
    private prisma: PrismaService,
    private emailService: EmailService,
  ) {}

  async login(
    dto: LoginDto,
  ): Promise<{ access_token: string } | { twoFactorRequired: true; loginToken: string }> {
    const user = await this.usersService.findByEmail(dto.email);
    if (!user) throw new UnauthorizedException('Credenciais inválidas.');

    const valid = await bcrypt.compare(dto.password, user.passwordHash);
    if (!valid) throw new UnauthorizedException('Credenciais inválidas.');

    if (user.twoFactorEnabled) {
      const loginToken = await this.issueTwoFactorCode(user.id, user.email, true);
      return { twoFactorRequired: true, loginToken: loginToken! };
    }

    const payload = { sub: user.id, email: user.email };
    return { access_token: this.jwtService.sign(payload) };
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
            '[AUTH] Falha ao enviar e-mail de código de verificação para',
            email,
          );
        }
      })
      .catch((err: unknown) => {
        console.error(
          '[AUTH] Erro inesperado no envio do e-mail de código de verificação:',
          err,
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
      const updated = await this.prisma.twoFactorCode.update({
        where: { id: record.id },
        data: { attempts: { increment: 1 } },
      });
      if (updated.attempts >= MAX_TWO_FACTOR_ATTEMPTS) {
        // Lock the code out permanently once the limit is reached, so a
        // subsequent correct-looking guess (or a retry racing this one)
        // cannot slip through the up-front check on a later request.
        await this.prisma.twoFactorCode.update({
          where: { id: record.id },
          data: { usedAt: new Date() },
        });
      }
      throw new BadRequestException(TWO_FACTOR_GENERIC_ERROR);
    }

    await this.prisma.twoFactorCode.update({
      where: { id: record.id },
      data: { usedAt: new Date() },
    });

    const user = await this.prisma.user.findUnique({
      where: { id: record.userId },
    });
    if (!user) {
      throw new BadRequestException(TWO_FACTOR_GENERIC_ERROR);
    }

    const payload = { sub: user.id, email: user.email };
    return { access_token: this.jwtService.sign(payload) };
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
  ): Promise<{ message: string }> {
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
      const updated = await this.prisma.twoFactorCode.update({
        where: { id: record.id },
        data: { attempts: { increment: 1 } },
      });
      if (updated.attempts >= MAX_TWO_FACTOR_ATTEMPTS) {
        // Lock the code out permanently once the limit is reached, so a
        // subsequent correct-looking guess (or a retry racing this one)
        // cannot slip through the up-front check on a later request.
        await this.prisma.twoFactorCode.update({
          where: { id: record.id },
          data: { usedAt: new Date() },
        });
      }
      throw new BadRequestException(TWO_FACTOR_GENERIC_ERROR);
    }

    await this.prisma.twoFactorCode.update({
      where: { id: record.id },
      data: { usedAt: new Date() },
    });

    await this.prisma.user.update({
      where: { id: userId },
      data: { twoFactorEnabled: true },
    });

    return { message: '2FA ativado com sucesso.' };
  }

  async disableTwoFactor(
    userId: string,
    dto: DisableTwoFactorDto,
  ): Promise<{ message: string }> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('Usuário não encontrado.');

    const valid = await bcrypt.compare(dto.password, user.passwordHash);
    if (!valid) throw new UnauthorizedException('Senha incorreta.');

    await this.prisma.user.update({
      where: { id: userId },
      data: { twoFactorEnabled: false },
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
            '[AUTH] Falha ao enviar e-mail de aviso de desativação de 2FA para',
            user.email,
          );
        }
      })
      .catch((err: unknown) => {
        console.error(
          '[AUTH] Erro inesperado no envio do e-mail de aviso de desativação de 2FA:',
          err,
        );
      });

    return { message: '2FA desativado com sucesso.' };
  }

  async forgotPassword(dto: ForgotPasswordDto): Promise<{ message: string }> {
    const user = await this.usersService.findByEmail(dto.email);
    if (!user) return { message: FORGOT_PASSWORD_GENERIC_MESSAGE };

    await this.prisma.passwordResetToken.deleteMany({
      where: { userId: user.id },
    });

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
            '[AUTH] Falha ao enviar e-mail de recuperação de senha para',
            user.email,
          );
        }
      })
      .catch((err: unknown) => {
        console.error(
          '[AUTH] Erro inesperado no envio do e-mail de recuperação de senha:',
          err,
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

    await this.prisma.user.update({
      where: { id: resetToken.userId },
      data: { passwordHash },
    });

    await this.prisma.passwordResetToken.update({
      where: { id: resetToken.id },
      data: { usedAt: new Date() },
    });

    await this.prisma.passwordResetToken.deleteMany({
      where: { userId: resetToken.userId, id: { not: resetToken.id } },
    });

    return { message: 'Senha redefinida com sucesso.' };
  }
}
