import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { LocationSource } from '@prisma/client';

export interface ScanDto {
  petId: string;
  latitude?: number;
  longitude?: number;
  ipAddress: string;
  consentGranted: boolean;
  consentVersion: string;
}

@Injectable()
export class ScanService {
  constructor(private prisma: PrismaService) {}

  async processScan(dto: ScanDto) {
    const pet = await this.prisma.pet.findUnique({
      where: { id: dto.petId },
      include: { owner: true },
    });

    if (!pet) throw new NotFoundException('Pet não encontrado.');

    const locationSource =
      dto.consentGranted && dto.latitude != null
        ? LocationSource.GPS
        : LocationSource.IP;

    await this.prisma.scanLog.create({
      data: {
        petId: pet.id,
        latitude: dto.latitude,
        longitude: dto.longitude,
        ipAddress: dto.ipAddress,
        locationSource,
        consentGranted: dto.consentGranted,
        consentVersion: dto.consentVersion,
      },
    });

    if (pet.status === 'LOST') {
      console.log(
        `[WhatsApp MOCK] Notificando tutor ${pet.owner.name} ` +
          `(${pet.owner.whatsapp}): seu pet "${pet.name}" foi encontrado! ` +
          `Localização: ${dto.latitude ?? 'N/A'}, ${dto.longitude ?? 'N/A'}`,
      );
      return { message: 'Scan registrado. Tutor notificado.' };
    }

    return { message: 'Scan registrado.' };
  }
}
