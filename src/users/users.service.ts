import {
  Injectable,
  ConflictException,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import * as bcrypt from 'bcrypt';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';

@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService) {}

  async create(dto: CreateUserDto) {
    const exists = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });
    if (exists) throw new ConflictException('E-mail já cadastrado.');

    const passwordHash = await bcrypt.hash(dto.password, 10);

    return this.prisma.user.create({
      data: {
        name: dto.name,
        email: dto.email,
        passwordHash,
        whatsapp: dto.whatsapp,
        age: dto.age,
      },
      select: {
        id: true,
        name: true,
        email: true,
        whatsapp: true,
        age: true,
      },
    });
  }

  async findByEmail(email: string) {
    return this.prisma.user.findUnique({ where: { email } });
  }

  async findMe(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        name: true,
        email: true,
        whatsapp: true,
        age: true,
      },
    });
    if (!user) throw new NotFoundException('Usuário não encontrado.');
    return user;
  }

  async updateMe(userId: string, dto: UpdateUserDto) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('Usuário não encontrado.');

    return this.prisma.user.update({
      where: { id: userId },
      data: { ...dto },
      select: {
        id: true,
        name: true,
        email: true,
        whatsapp: true,
        age: true,
      },
    });
  }

  async deleteMe(userId: string): Promise<void> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('Usuário não encontrado.');

    await this.prisma.user.delete({ where: { id: userId } });
  }
  async testCallMeBot(userId: string, apiKey: string): Promise<void> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user?.whatsapp) {
      throw new BadRequestException('Número de WhatsApp não cadastrado.');
    }

    const phone = user.whatsapp.replace(/\D/g, '');
    const message = encodeURIComponent(
      '✅ TagReativa: configuração confirmada. Você receberá alertas aqui quando seu pet for escaneado.',
    );
    const url = `https://api.callmebot.com/whatsapp.php?phone=${phone}&text=${message}&apikey=${apiKey}`;

    try {
      const response = await fetch(url);
      const text = await response.text();
      if (!response.ok || text.toLowerCase().includes('error')) {
        throw new Error('CallMeBot rejeitou a requisição.');
      }
    } catch {
      throw new BadRequestException(
        'Código inválido ou WhatsApp não autorizado no bot.',
      );
    }
  }
}
