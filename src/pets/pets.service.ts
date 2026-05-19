import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreatePetDto } from './dto/create-pet.dto';
import { UpdatePetDto } from './dto/update-pet.dto';
import { randomUUID } from 'crypto';
import { PetStatus, Pet } from '@prisma/client';
import * as QRCode from 'qrcode';

@Injectable()
export class PetsService {
  constructor(private prisma: PrismaService) { }

  async create(ownerId: string, dto: CreatePetDto) {
    const petId = randomUUID();
    const qrCodeUrl = `${process.env.APP_URL ?? 'http://localhost:3000'}/scan/${petId}`;
    const qrCodeBase64 = await QRCode.toDataURL(qrCodeUrl);

    const pet = await this.prisma.pet.create({
      data: {
        id: petId,
        ownerId,
        name: dto.name,
        species: dto.species,
        qrCodeUrl,
        age: dto.age,
        breed: dto.breed,
        photoUrl: dto.photoUrl,
        notes: dto.notes,
      },
    });

    return { ...pet, qrCodeBase64 };
  }

  async findAllByOwner(ownerId: string) {
    return this.prisma.pet.findMany({ where: { ownerId } });
  }

  async findOne(petId: string, ownerId: string): Promise<Pet> {
    const pet = await this.prisma.pet.findUnique({ where: { id: petId } });

    if (!pet) throw new NotFoundException('Pet não encontrado.');
    if (pet.ownerId !== ownerId) throw new ForbiddenException('Acesso negado.');

    return pet;
  }
  async updatePet(
    petId: string,
    ownerId: string,
    dto: UpdatePetDto,
  ): Promise<Pet> {
    const pet = await this.prisma.pet.findUnique({ where: { id: petId } });

    if (!pet) throw new NotFoundException('Pet não encontrado.');
    if (pet.ownerId !== ownerId) throw new ForbiddenException('Acesso negado.');

    return this.prisma.pet.update({
      where: { id: petId },
      data: { ...dto },
    });
  }

  async deletePet(petId: string, ownerId: string): Promise<void> {
    const pet = await this.prisma.pet.findUnique({ where: { id: petId } });

    if (!pet) throw new NotFoundException('Pet não encontrado.');
    if (pet.ownerId !== ownerId) throw new ForbiddenException('Acesso negado.');

    await this.prisma.pet.delete({ where: { id: petId } });
  }

  async updateStatus(
    petId: string,
    ownerId: string,
    status: PetStatus,
  ): Promise<Pet> {
    const pet = await this.prisma.pet.findUnique({ where: { id: petId } });

    if (!pet) throw new NotFoundException('Pet não encontrado.');
    if (pet.ownerId !== ownerId) throw new ForbiddenException('Acesso negado.');

    return this.prisma.pet.update({
      where: { id: petId },
      data: { status },
    });
  }

  async findScans(petId: string, ownerId: string) {
    const pet = await this.prisma.pet.findUnique({ where: { id: petId } });

    if (!pet) throw new NotFoundException('Pet não encontrado.');
    if (pet.ownerId !== ownerId) throw new ForbiddenException('Acesso negado.');

    return this.prisma.scanLog.findMany({
      where: { petId },
      orderBy: { timestamp: 'desc' },
    });
  }
}
