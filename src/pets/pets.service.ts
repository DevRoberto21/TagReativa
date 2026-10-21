import {
  BadRequestException,
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
import { CloudinaryService } from '../cloudinary/cloudinary.service';

const MAX_SHORT_CODE_ATTEMPTS = 3;
// Scans are written by anonymous callers, so the owner read is bounded.
const MAX_SCANS_RETURNED = 200;

@Injectable()
export class PetsService {
  constructor(
    private prisma: PrismaService,
    private cloudinary: CloudinaryService,
  ) {}

  // The upload signature pins photos under the owner's prefix; checking it
  // here stops one account from attaching another account's upload.
  private assertOwnedPhoto(photoUrl: string, ownerId: string): void {
    if (!this.cloudinary.isOwnedPhotoUrl(photoUrl, ownerId)) {
      throw new BadRequestException(
        'Foto inválida. Envie a imagem novamente pelo TagReativa.',
      );
    }
  }

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
    if (dto.photoUrl) this.assertOwnedPhoto(dto.photoUrl, ownerId);
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
    const pets = await this.prisma.pet.findMany({
      where: { ownerId },
      omit: { ownerId: true },
      include: { _count: { select: { scanLogs: true } } },
    });
    return pets.map(({ _count, ...pet }) => ({
      ...pet,
      scanCount: _count.scanLogs,
    }));
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
    if (dto.photoUrl === undefined) {
      return this.prisma.pet
        .update({ where: { id: petId, ownerId }, data: { ...dto } })
        .catch((err) => this.rejectWrite(err, petId, ownerId));
    }

    // Photos stored before uploads were bound to the owner are still accepted
    // when resent unchanged; only a new photo must carry the owner's prefix.
    const { photoUrl: oldPhotoUrl } = await this.findOne(petId, ownerId);
    const replaced = dto.photoUrl !== oldPhotoUrl;
    if (replaced && dto.photoUrl) this.assertOwnedPhoto(dto.photoUrl, ownerId);

    const pet = await this.prisma.pet
      .update({ where: { id: petId, ownerId }, data: { ...dto } })
      .catch((err) => this.rejectWrite(err, petId, ownerId));
    if (replaced) await this.cloudinary.deleteUnusedPhotos([oldPhotoUrl]);
    return pet;
  }

  async deletePet(petId: string, ownerId: string): Promise<void> {
    const pet = await this.prisma.pet
      .delete({ where: { id: petId, ownerId } })
      .catch((err) => this.rejectWrite(err, petId, ownerId));
    await this.cloudinary.deleteUnusedPhotos([pet.photoUrl]);
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
      // Only what the owner needs to find the pet; consent fields and finder
      // identifiers (ipAddress, deviceId) stay server-side.
      select: {
        latitude: true,
        longitude: true,
        locationSource: true,
        timestamp: true,
        alertSent: true,
      },
    });
  }
}
