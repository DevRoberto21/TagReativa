import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreatePetDto } from './dto/create-pet.dto';
import { randomUUID } from 'crypto';

@Injectable()
export class PetsService {
  constructor(private prisma: PrismaService) {}

  async create(ownerId: string, dto: CreatePetDto) {
    const petId = randomUUID();
    const qrCodeUrl = `${process.env.APP_URL ?? 'http://localhost:3000'}/scan/${petId}`;

    return this.prisma.pet.create({
      data: {
        id: petId,
        ownerId,
        name: dto.name,
        species: dto.species,
        physicalFallbackConsent: dto.physicalFallbackConsent,
        qrCodeUrl,
      },
    });
  }

  async findAllByOwner(ownerId: string) {
    return this.prisma.pet.findMany({ where: { ownerId } });
  }
}
