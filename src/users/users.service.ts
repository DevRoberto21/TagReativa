import {
  Injectable,
  ConflictException,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CloudinaryService } from '../cloudinary/cloudinary.service';
import * as bcrypt from 'bcrypt';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { DeleteAccountDto } from './dto/delete-account.dto';
import { Prisma } from '@prisma/client';

// One message for both identifiers, so the response does not say which one
// is already registered.
const CONTACT_CONFLICT_MESSAGE = 'E-mail ou WhatsApp já cadastrado.';

function isUniqueViolation(err: unknown): boolean {
  return (
    err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002'
  );
}

@Injectable()
export class UsersService {
  constructor(
    private prisma: PrismaService,
    private cloudinary: CloudinaryService,
  ) {}

  async create(dto: CreateUserDto) {
    const exists = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });
    if (exists) throw new ConflictException(CONTACT_CONFLICT_MESSAGE);

    const passwordHash = await bcrypt.hash(dto.password, 10);

    try {
      return await this.prisma.user.create({
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
    } catch (err) {
      if (isUniqueViolation(err)) {
        throw new ConflictException(CONTACT_CONFLICT_MESSAGE);
      }
      throw err;
    }
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

    // 403 rather than 401: the frontend logs the user out on any 401.
    const valid = await bcrypt.compare(dto.password, user.passwordHash);
    if (!valid) throw new ForbiddenException('Senha incorreta.');

    try {
      return await this.prisma.user.update({
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
    } catch (err) {
      if (isUniqueViolation(err)) {
        throw new ConflictException('WhatsApp já cadastrado.');
      }
      throw err;
    }
  }
  async deleteMe(userId: string, dto: DeleteAccountDto): Promise<void> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('Usuário não encontrado.');

    // 403 rather than 401: the frontend logs the user out on any 401.
    const valid = await bcrypt.compare(dto.password, user.passwordHash);
    if (!valid) throw new ForbiddenException('Senha incorreta.');

    // Pets cascade with the account, so their photos are read first.
    const pets = await this.prisma.pet.findMany({
      where: { ownerId: userId },
      select: { photoUrl: true },
    });
    await this.prisma.user.delete({ where: { id: userId } });
    await this.cloudinary.deleteUnusedPhotos(pets.map((p) => p.photoUrl));
  }
}
