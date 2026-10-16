import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreatePetDto } from './dto/create-pet.dto';
import { UpdatePetDto } from './dto/update-pet.dto';
import { PetStatus, Pet, Prisma } from '@prisma/client';
import * as QRCode from 'qrcode';
import { buildQrCodeUrl, generateShortCode } from './short-code';

const MAX_SHORT_CODE_ATTEMPTS = 3;
// Scans are written by anonymous callers, so the owner read is bounded.
const MAX_SCANS_RETURNED = 200;

@Injectable()
export class PetsService {
  constructor(private prisma: PrismaService) {}

  private async createWithShortCode(ownerId: string, dto: CreatePetDto) {
    for (let attempt = 1; ; attempt++) {
      try {
        return await this.prisma.pet.create({
          data: {
            ownerId,
            name: dto.name,
            species: dto.species,
            shortCode: generateShortCode(),
            age: dto.age,
            breed: dto.breed,
            photoUrl: dto.photoUrl,
            notes: dto.notes,
          },
        });
      } catch (err) {
        const collided =
          err instanceof Prisma.PrismaClientKnownRequestError &&
          err.code === 'P2002';
        if (!collided || attempt >= MAX_SHORT_CODE_ATTEMPTS) throw err;
      }
    }
  }

  async create(ownerId: string, dto: CreatePetDto) {
    const pet = await this.createWithShortCode(ownerId, dto);
    const qrCodeUrl = buildQrCodeUrl(pet.shortCode);
    // Level Q survives scratches on a printed tag; the short URL keeps the
    // code small even with the extra redundancy.
    const qrCodeBase64 = await QRCode.toDataURL(qrCodeUrl, {
      errorCorrectionLevel: 'Q',
    });

    return { ...pet, qrCodeUrl, qrCodeBase64 };
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

  // The write itself filters by owner, so ownership cannot change between
  // check and write. Only on a miss do we look up the pet to keep the
  // 404/403 answers.
  private async rejectWrite(
    err: unknown,
    petId: string,
    ownerId: string,
  ): Promise<never> {
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === 'P2025'
    ) {
      await this.findOne(petId, ownerId);
    }
    throw err;
  }

  async updatePet(
    petId: string,
    ownerId: string,
    dto: UpdatePetDto,
  ): Promise<Pet> {
    return this.prisma.pet
      .update({ where: { id: petId, ownerId }, data: { ...dto } })
      .catch((err) => this.rejectWrite(err, petId, ownerId));
  }

  async deletePet(petId: string, ownerId: string): Promise<void> {
    await this.prisma.pet
      .delete({ where: { id: petId, ownerId } })
      .catch((err) => this.rejectWrite(err, petId, ownerId));
  }

  async updateStatus(
    petId: string,
    ownerId: string,
    status: PetStatus,
  ): Promise<Pet> {
    return this.prisma.pet
      .update({ where: { id: petId, ownerId }, data: { status } })
      .catch((err) => this.rejectWrite(err, petId, ownerId));
  }

  async findScans(petId: string, ownerId: string) {
    const pet = await this.prisma.pet.findUnique({ where: { id: petId } });

    if (!pet) throw new NotFoundException('Pet não encontrado.');
    if (pet.ownerId !== ownerId) throw new ForbiddenException('Acesso negado.');

    return this.prisma.scanLog.findMany({
      where: { petId },
      orderBy: { timestamp: 'desc' },
      take: MAX_SCANS_RETURNED,
    });
  }
}
