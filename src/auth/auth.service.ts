import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { randomBytes, createHash } from 'crypto';
import { UsersService } from '../users/users.service';
import { PrismaService } from '../prisma/prisma.service';
import { EmailService } from '../email/email.service';
import * as bcrypt from 'bcrypt';
import { LoginDto } from './dto/login.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';

const RESET_TOKEN_TTL_MS = 60 * 60 * 1000;
const FORGOT_PASSWORD_GENERIC_MESSAGE =
  'Se esse e-mail existir em nossa base, enviamos um link de recuperação.';

@Injectable()
export class AuthService {
  constructor(
    private usersService: UsersService,
    private jwtService: JwtService,
    private prisma: PrismaService,
    private emailService: EmailService,
  ) {}

  async login(dto: LoginDto) {
    const user = await this.usersService.findByEmail(dto.email);
    if (!user) throw new UnauthorizedException('Credenciais inválidas.');

    const valid = await bcrypt.compare(dto.password, user.passwordHash);
    if (!valid) throw new UnauthorizedException('Credenciais inválidas.');

    const payload = { sub: user.id, email: user.email };
    return { access_token: this.jwtService.sign(payload) };
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
      });

    return { message: FORGOT_PASSWORD_GENERIC_MESSAGE };
  }
}
