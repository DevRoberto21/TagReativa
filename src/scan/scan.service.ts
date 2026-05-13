import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { LocationSource, NotificationChannel } from '@prisma/client';

export interface ScanDto {
  petId: string;
  latitude?: number;
  longitude?: number;
  ipAddress: string;
  consentGranted: boolean;
  consentVersion: string;
}

interface IpApiResponse {
  status: 'success' | 'fail';
  lat?: number;
  lon?: number;
}

async function resolveLocationByIp(
  ip: string,
): Promise<{ latitude: number | null; longitude: number | null }> {
  const privateIp = /^(127\.|::1$|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/;
  if (privateIp.test(ip)) return { latitude: null, longitude: null };

  try {
    const res = await fetch(
      `http://ip-api.com/json/${ip}?fields=status,lat,lon`,
    );
    const data = (await res.json()) as IpApiResponse;
    if (data.status === 'success' && data.lat != null && data.lon != null) {
      return { latitude: data.lat, longitude: data.lon };
    }
  } catch {
    // falha silenciosa
  }

  return { latitude: null, longitude: null };
}

async function sendCallMeBot(
  whatsapp: string,
  apiKey: string,
  message: string,
): Promise<boolean> {
  try {
    const encoded = encodeURIComponent(message);
    const url = `https://api.callmebot.com/whatsapp.php?phone=${whatsapp}&text=${encoded}&apikey=${apiKey}`;
    const res = await fetch(url);
    return res.ok;
  } catch {
    return false;
  }
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

    const hasGps = dto.consentGranted && dto.latitude != null;
    const locationSource = hasGps ? LocationSource.GPS : LocationSource.IP;

    let latitude = dto.latitude ?? null;
    let longitude = dto.longitude ?? null;

    if (!hasGps) {
      const resolved = await resolveLocationByIp(dto.ipAddress);
      latitude = resolved.latitude;
      longitude = resolved.longitude;
    }

    const scanLog = await this.prisma.scanLog.create({
      data: {
        petId: pet.id,
        latitude,
        longitude,
        ipAddress: dto.ipAddress,
        locationSource,
        consentGranted: dto.consentGranted,
        consentVersion: dto.consentVersion,
      },
    });

    if (pet.status === 'LOST' && pet.owner.callMeBotApiKey) {
      const hasLocation = latitude != null && longitude != null;
      const isGps = locationSource === LocationSource.GPS;
      const message = hasLocation
        ? isGps
          ? `Seu pet ${pet.name} foi encontrado! 📍 Localização GPS: https://maps.google.com/?q=${latitude},${longitude}`
          : `Seu pet ${pet.name} foi encontrado! O resgatador negou o GPS, Não foi possível obter localização precisa. O endereço abaixo é baseado no IP e pode estar em outra cidade: https://maps.google.com/?q=${latitude},${longitude}`
        : `Seu pet ${pet.name} foi encontrado! Não foi possível obter localização.`;
      const delivered = await sendCallMeBot(
        pet.owner.whatsapp,
        pet.owner.callMeBotApiKey,
        message,
      );

      try {
        await this.prisma.notification.create({
          data: {
            scanLogId: scanLog.id,
            channel: NotificationChannel.WHATSAPP,
            delivered,
          },
        });
      } catch (err: unknown) {
        console.error('[Notification] Falha ao persistir registro:', err);
      }
    }

    return {
      pet: {
        name: pet.name,
        species: pet.species,
        status: pet.status,
        photoUrl: pet.photoUrl ?? null,
        physicalFallbackConsent: pet.physicalFallbackConsent,
      },
      owner: {
        whatsapp: pet.status === 'LOST' ? pet.owner.whatsapp : null,
      },
    };
  }
}
