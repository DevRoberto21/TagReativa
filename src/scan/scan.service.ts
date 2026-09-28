import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { TelegramService } from '../telegram/telegram.service';
import { EmailService } from '../email/email.service';
import { LocationSource, NotificationChannel } from '@prisma/client';

export interface ScanDto {
  petId: string;
  latitude?: number;
  longitude?: number;
  ipAddress: string;
  consentGranted: boolean;
  consentVersion: string;
  deviceId?: string;
}

// Alerts are rate-limited per pet so repeated scans (reloads, pranks) do not
// flood the owner. The scan itself is always recorded and the owner contact is
// always returned; only the e-mail/Telegram dispatch is skipped.
const ALERT_WINDOW_MS = 30 * 60 * 1000;
const MAX_ALERTS_PER_DEVICE = 3;
const MAX_ALERTS_PER_PET = 10;

interface IpApiResponse {
  status: string;
  lat: number;
  lon: number;
}

@Injectable()
export class ScanService {
  constructor(
    private prisma: PrismaService,
    private telegram: TelegramService,
    private emailService: EmailService,
  ) {}

  private buildWhatsappHref(whatsapp: string): string {
    const digits = whatsapp.replace(/\D/g, '');
    const number = digits.startsWith('55') ? digits : `55${digits}`;
    return `https://wa.me/${number}`;
  }

  private async resolveLocationByIp(
    ip: string,
  ): Promise<{ latitude: number | null; longitude: number | null }> {
    const privateIp = /^(127\.|::1$|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/;
    if (privateIp.test(ip)) return { latitude: null, longitude: null };

    try {
      const res = await fetch(`http://ip-api.com/json/${ip}`);
      const data = (await res.json()) as IpApiResponse;

      if (data.status !== 'success') return { latitude: null, longitude: null };

      return { latitude: data.lat, longitude: data.lon };
    } catch (err) {
      console.error('[IP-API] erro:', err);
    }

    return { latitude: null, longitude: null };
  }

  private async persistNotification(
    scanLogId: string,
    channel: NotificationChannel,
    delivered: boolean,
  ): Promise<void> {
    try {
      await this.prisma.notification.create({
        data: { scanLogId, channel, delivered },
      });
    } catch (err: unknown) {
      console.error('[Notification] Falha ao persistir registro:', err);
    }
  }

  private async notifyTelegram(
    scanLogId: string,
    chatId: string,
    message: string,
    location: { latitude: number; longitude: number } | null,
  ): Promise<void> {
    let delivered: boolean;
    try {
      delivered = await this.telegram.sendMessage(chatId, message);
      // The pin is a complement to the text; skip it if the text failed.
      if (delivered && location) {
        await this.telegram.sendLocation(
          chatId,
          location.latitude,
          location.longitude,
        );
      }
    } catch (err: unknown) {
      console.error('[Notification] Falha ao enviar Telegram:', err);
      return;
    }
    await this.persistNotification(
      scanLogId,
      NotificationChannel.TELEGRAM,
      delivered,
    );
  }

  private async notifyEmail(
    scanLogId: string,
    to: string,
    petName: string,
    message: string,
  ): Promise<void> {
    let delivered: boolean;
    try {
      delivered = await this.emailService.send(
        to,
        `Seu pet ${petName} foi encontrado!`,
        message,
      );
    } catch (err: unknown) {
      console.error('[Notification] Falha ao enviar Email:', err);
      return;
    }
    await this.persistNotification(
      scanLogId,
      NotificationChannel.EMAIL,
      delivered,
    );
  }

  private async canSendAlert(
    petId: string,
    deviceId?: string,
  ): Promise<boolean> {
    const since = new Date(Date.now() - ALERT_WINDOW_MS);
    const where = { petId, alertSent: true, timestamp: { gte: since } };

    const petAlerts = await this.prisma.scanLog.count({ where });
    if (petAlerts >= MAX_ALERTS_PER_PET) return false;

    if (!deviceId) return true;

    const deviceAlerts = await this.prisma.scanLog.count({
      where: { ...where, deviceId },
    });
    return deviceAlerts < MAX_ALERTS_PER_DEVICE;
  }

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
      const resolved = await this.resolveLocationByIp(dto.ipAddress);
      latitude = resolved.latitude;
      longitude = resolved.longitude;
    }

    const alertSent =
      pet.status === 'LOST' && (await this.canSendAlert(pet.id, dto.deviceId));

    const scanLog = await this.prisma.scanLog.create({
      data: {
        petId: pet.id,
        latitude,
        longitude,
        ipAddress: dto.ipAddress,
        locationSource,
        consentGranted: dto.consentGranted,
        consentVersion: dto.consentVersion,
        deviceId: dto.deviceId,
        alertSent,
      },
    });

    if (alertSent) {
      const location =
        latitude != null && longitude != null ? { latitude, longitude } : null;
      const isGps = locationSource === LocationSource.GPS;
      const message = location
        ? isGps
          ? `Seu pet ${pet.name} foi encontrado! 📍 Localização GPS: https://maps.google.com/?q=${latitude},${longitude}`
          : `Seu pet ${pet.name} foi encontrado! O resgatador negou o GPS. Endereço baseado no IP (pode estar impreciso): https://maps.google.com/?q=${latitude},${longitude}`
        : `Seu pet ${pet.name} foi encontrado! Não foi possível obter localização.`;

      const dispatches: Promise<void>[] = [];

      if (pet.owner.telegramChatId) {
        dispatches.push(
          this.notifyTelegram(
            scanLog.id,
            pet.owner.telegramChatId,
            message,
            location,
          ),
        );
      }

      dispatches.push(
        this.notifyEmail(scanLog.id, pet.owner.email, pet.name, message),
      );

      await Promise.allSettled(dispatches);
    }

    return {
      pet: {
        name: pet.name,
        species: pet.species,
        status: pet.status,
        photoUrl: pet.photoUrl ?? null,
        notes: pet.notes ?? null,
      },
      ownerNotified: alertSent,
      owner: {
        name: pet.status === 'LOST' ? pet.owner.name : null,
        whatsappHref:
          pet.status === 'LOST' && pet.owner.whatsapp
            ? this.buildWhatsappHref(pet.owner.whatsapp)
            : null,
      },
    };
  }
}
