import {
  Injectable,
  ConflictException,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import * as bcrypt from 'bcrypt';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { DeleteAccountDto } from './dto/delete-account.dto';

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
        twoFactorEnabled: true,
        telegramChatId: true,
      },
    });
    if (!user) throw new NotFoundException('Usuário não encontrado.');
    const { telegramChatId, ...profile } = user;
    return { ...profile, telegramLinked: telegramChatId != null };
  }
  async updateMe(userId: string, dto: UpdateUserDto) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('Usuário não encontrado.');

    return this.prisma.user.update({
      where: { id: userId },
      data: {
        name: dto.name,
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
  async deleteMe(userId: string, dto: DeleteAccountDto): Promise<void> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('Usuário não encontrado.');

    // 403 rather than 401: the frontend logs the user out on any 401.
    const valid = await bcrypt.compare(dto.password, user.passwordHash);
    if (!valid) throw new ForbiddenException('Senha incorreta.');

    await this.prisma.user.delete({ where: { id: userId } });
  }
}
