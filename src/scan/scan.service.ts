import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { TelegramService } from '../telegram/telegram.service';
import { EmailService } from '../email/email.service';
import { LocationSource, NotificationChannel, Prisma } from '@prisma/client';
import { isUUID } from 'class-validator';
import { describeError } from '../describe-error';

export interface ScanDto {
  // Short code from the printed tag, or the pet UUID on tags printed before
  // short codes existed.
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
// deviceId is chosen by the client, so the server-derived address is capped too.
const MAX_ALERTS_PER_SOURCE = 3;
const MAX_ALERTS_PER_PET = 10;
const IP_LOOKUP_TIMEOUT_MS = 3000;
// Loopback, private, link-local and unique-local ranges, also IPv4-mapped.
const PRIVATE_IP =
  /^(?:::ffff:)?(?:127\.|10\.|192\.168\.|172\.(?:1[6-9]|2\d|3[01])\.|169\.254\.)|^(?:::1$|fe80:|f[cd][0-9a-f]{2}:)/i;

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
    if (PRIVATE_IP.test(ip)) return { latitude: null, longitude: null };

    try {
      const res = await fetch(`http://ip-api.com/json/${ip}`, {
        signal: AbortSignal.timeout(IP_LOOKUP_TIMEOUT_MS),
      });
      const data = (await res.json()) as IpApiResponse;

      if (data.status !== 'success') return { latitude: null, longitude: null };

      return { latitude: data.lat, longitude: data.lon };
    } catch (err) {
      console.error('[IP-API] erro:', describeError(err));
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
      console.error(
        '[Notification] Falha ao persistir registro:',
        describeError(err),
      );
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
      console.error(
        '[Notification] Falha ao enviar Telegram:',
        describeError(err),
      );
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
      console.error(
        '[Notification] Falha ao enviar Email:',
        describeError(err),
      );
      return;
    }
    await this.persistNotification(
      scanLogId,
      NotificationChannel.EMAIL,
      delivered,
    );
  }

  private async canSendAlert(
    tx: Prisma.TransactionClient,
    petId: string,
    ipAddress: string,
    deviceId?: string,
  ): Promise<boolean> {
    const since = new Date(Date.now() - ALERT_WINDOW_MS);
    const where = { petId, alertSent: true, timestamp: { gte: since } };

    const petAlerts = await tx.scanLog.count({ where });
    if (petAlerts >= MAX_ALERTS_PER_PET) return false;

    const sourceAlerts = await tx.scanLog.count({
      where: { ...where, ipAddress },
    });
    if (sourceAlerts >= MAX_ALERTS_PER_SOURCE) return false;

    if (!deviceId) return true;

    const deviceAlerts = await tx.scanLog.count({
      where: { ...where, deviceId },
    });
    return deviceAlerts < MAX_ALERTS_PER_DEVICE;
  }

  async processScan(dto: ScanDto) {
    const pet = await this.prisma.pet.findUnique({
      where: isUUID(dto.petId)
        ? { id: dto.petId }
        : { shortCode: dto.petId.toUpperCase() },
      include: { owner: true },
    });

    if (!pet) throw new NotFoundException('Pet não encontrado.');

    const hasGps = dto.consentGranted && dto.latitude != null;
    const locationSource = hasGps ? LocationSource.GPS : LocationSource.IP;

    let latitude = dto.latitude ?? null;
    let longitude = dto.longitude ?? null;

    const { scanLog, alertSent } = await this.prisma.$transaction(
      async (tx) => {
        let alertSent = false;
        if (pet.status === 'LOST') {
          // Concurrent scans of the same pet would otherwise all read the same
          // count and pass the cap together.
          await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${pet.id}))`;
          alertSent = await this.canSendAlert(
            tx,
            pet.id,
            dto.ipAddress,
            dto.deviceId,
          );
        }

        const scanLog = await tx.scanLog.create({
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
        return { scanLog, alertSent };
      },
    );

    // The finder's address goes to a third party only when the owner will
    // actually get an alert, and only with the finder's consent. The lookup
    // runs after commit so the pet lock is never held across the network.
    if (!hasGps && alertSent && dto.consentGranted) {
      const resolved = await this.resolveLocationByIp(dto.ipAddress);
      latitude = resolved.latitude;
      longitude = resolved.longitude;
      if (latitude != null && longitude != null) {
        // The alert is already committed; a failed write must not block it.
        await this.prisma.scanLog
          .update({ where: { id: scanLog.id }, data: { latitude, longitude } })
          .catch((err: unknown) =>
            console.error(
              '[ScanLog] Falha ao gravar localização:',
              describeError(err),
            ),
          );
      }
    }

    if (alertSent) {
      const location =
        latitude != null && longitude != null ? { latitude, longitude } : null;
      const isGps = locationSource === LocationSource.GPS;
      const message = location
        ? isGps
          ? `Seu pet ${pet.name} foi encontrado! 📍 Localização informada pelo aparelho de quem leu a tag (não verificada): https://maps.google.com/?q=${latitude},${longitude}`
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
