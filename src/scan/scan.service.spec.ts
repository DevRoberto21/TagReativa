import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { ScanService } from './scan.service';
import { PrismaService } from '../prisma/prisma.service';
import { CallMeBotService } from '../callmebot/callmebot.service';
import { EmailService } from '../email/email.service';
import { NotificationChannel, PetStatus, LocationSource } from '@prisma/client';

describe('ScanService', () => {
  let service: ScanService;
  let prisma: {
    pet: { findUnique: jest.Mock };
    scanLog: { create: jest.Mock; count: jest.Mock };
    notification: { create: jest.Mock };
  };
  let callMeBot: { send: jest.Mock };
  let email: { send: jest.Mock };

  const basePet = {
    id: 'pet-1',
    name: 'Rex',
    species: 'dog',
    status: PetStatus.LOST,
    photoUrl: null,
    notes: null,
    owner: {
      id: 'owner-1',
      name: 'Roberto',
      email: 'owner@example.com',
      whatsapp: '5511999999999',
      callMeBotApiKey: 'callmebot-key',
    },
  };

  const scanDto = {
    petId: 'pet-1',
    latitude: undefined,
    longitude: undefined,
    ipAddress: '127.0.0.1',
    consentGranted: false,
    consentVersion: 'v1',
  };

  const createdScanLog = {
    id: 'scan-1',
    petId: 'pet-1',
    latitude: null,
    longitude: null,
    ipAddress: '127.0.0.1',
    locationSource: LocationSource.IP,
    consentGranted: false,
    consentVersion: 'v1',
    timestamp: new Date(),
  };

  beforeEach(async () => {
    prisma = {
      pet: { findUnique: jest.fn() },
      scanLog: { create: jest.fn(), count: jest.fn() },
      notification: { create: jest.fn() },
    };
    callMeBot = { send: jest.fn() };
    email = { send: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ScanService,
        { provide: PrismaService, useValue: prisma },
        { provide: CallMeBotService, useValue: callMeBot },
        { provide: EmailService, useValue: email },
      ],
    }).compile();

    service = module.get<ScanService>(ScanService);

    prisma.scanLog.create.mockResolvedValue(createdScanLog);
    prisma.scanLog.count.mockResolvedValue(0);
    prisma.notification.create.mockResolvedValue({});
  });

  it('throws NotFoundException when the pet does not exist', async () => {
    prisma.pet.findUnique.mockResolvedValue(null);

    await expect(service.processScan(scanDto)).rejects.toThrow(
      NotFoundException,
    );
    expect(callMeBot.send).not.toHaveBeenCalled();
    expect(email.send).not.toHaveBeenCalled();
  });

  it('dispatches both WhatsApp and Email when the pet is LOST', async () => {
    prisma.pet.findUnique.mockResolvedValue(basePet);
    callMeBot.send.mockResolvedValue(true);
    email.send.mockResolvedValue(true);

    await service.processScan(scanDto);

    expect(callMeBot.send).toHaveBeenCalledWith(
      basePet.owner.whatsapp,
      basePet.owner.callMeBotApiKey,
      expect.any(String),
    );
    expect(email.send).toHaveBeenCalledWith(
      basePet.owner.email,
      expect.any(String),
      expect.any(String),
    );
    expect(prisma.notification.create).toHaveBeenCalledWith({
      data: {
        scanLogId: createdScanLog.id,
        channel: NotificationChannel.WHATSAPP,
        delivered: true,
      },
    });
    expect(prisma.notification.create).toHaveBeenCalledWith({
      data: {
        scanLogId: createdScanLog.id,
        channel: NotificationChannel.EMAIL,
        delivered: true,
      },
    });
    expect(prisma.notification.create).toHaveBeenCalledTimes(2);
  });

  it.each([PetStatus.SAFE, PetStatus.RESCUE_CONFIRMED])(
    'does not notify either channel when pet status is %s',
    async (status) => {
      prisma.pet.findUnique.mockResolvedValue({ ...basePet, status });

      await service.processScan(scanDto);

      expect(callMeBot.send).not.toHaveBeenCalled();
      expect(email.send).not.toHaveBeenCalled();
      expect(prisma.notification.create).not.toHaveBeenCalled();
    },
  );

  it('still sends Email and returns normally when WhatsApp delivery fails', async () => {
    prisma.pet.findUnique.mockResolvedValue(basePet);
    callMeBot.send.mockResolvedValue(false);
    email.send.mockResolvedValue(true);

    const result = await service.processScan(scanDto);

    expect(email.send).toHaveBeenCalledTimes(1);
    expect(prisma.notification.create).toHaveBeenCalledWith({
      data: {
        scanLogId: createdScanLog.id,
        channel: NotificationChannel.WHATSAPP,
        delivered: false,
      },
    });
    expect(result.pet.name).toBe('Rex');
  });

  it('still sends WhatsApp and does not throw when Email send rejects', async () => {
    prisma.pet.findUnique.mockResolvedValue(basePet);
    callMeBot.send.mockResolvedValue(true);
    email.send.mockRejectedValue(new Error('Brevo down'));

    await expect(service.processScan(scanDto)).resolves.toBeDefined();

    expect(callMeBot.send).toHaveBeenCalledTimes(1);
    expect(prisma.notification.create).toHaveBeenCalledWith({
      data: {
        scanLogId: createdScanLog.id,
        channel: NotificationChannel.WHATSAPP,
        delivered: true,
      },
    });
    expect(prisma.notification.create).toHaveBeenCalledTimes(1);
  });

  it('returns normally when both channels fail', async () => {
    prisma.pet.findUnique.mockResolvedValue(basePet);
    callMeBot.send.mockResolvedValue(false);
    email.send.mockRejectedValue(new Error('Brevo down'));

    await expect(service.processScan(scanDto)).resolves.toBeDefined();

    expect(prisma.notification.create).toHaveBeenCalledTimes(1);
    expect(prisma.notification.create).toHaveBeenCalledWith({
      data: {
        scanLogId: createdScanLog.id,
        channel: NotificationChannel.WHATSAPP,
        delivered: false,
      },
    });
  });

  it('creates exactly one notification row per channel (no duplicates)', async () => {
    prisma.pet.findUnique.mockResolvedValue(basePet);
    callMeBot.send.mockResolvedValue(true);
    email.send.mockResolvedValue(true);

    await service.processScan(scanDto);

    const channelsCreated = prisma.notification.create.mock.calls.map(
      (call) => call[0].data.channel,
    );
    expect(channelsCreated.sort()).toEqual(
      [NotificationChannel.EMAIL, NotificationChannel.WHATSAPP].sort(),
    );
  });

  describe('alert rate limit', () => {
    const deviceId = '8f14e45f-ceea-467a-9575-0c5b0b0b7c11';

    // count() is called for the pet-wide total first, then for the device.
    function mockAlertCounts(total: number, device: number) {
      prisma.scanLog.count
        .mockResolvedValueOnce(total)
        .mockResolvedValueOnce(device);
    }

    function createdScanData() {
      const [[arg]] = prisma.scanLog.create.mock.calls as [
        [{ data: Record<string, unknown> }],
      ];
      return arg.data;
    }

    beforeEach(() => {
      prisma.pet.findUnique.mockResolvedValue(basePet);
      callMeBot.send.mockResolvedValue(true);
      email.send.mockResolvedValue(true);
    });

    it('sends the alert and records deviceId + alertSent when under both limits', async () => {
      mockAlertCounts(0, 0);

      const result = await service.processScan({ ...scanDto, deviceId });

      expect(email.send).toHaveBeenCalledTimes(1);
      expect(createdScanData()).toMatchObject({
        deviceId,
        alertSent: true,
      });
      expect(result.ownerNotified).toBe(true);
    });

    it('counts only alerted scans of this pet in the last 30 minutes', async () => {
      mockAlertCounts(0, 0);
      const before = Date.now();

      await service.processScan({ ...scanDto, deviceId });

      type CountArgs = [{ where: { timestamp: { gte: Date } } }];
      const [totalQuery, deviceQuery] = (
        prisma.scanLog.count.mock.calls as CountArgs[]
      ).map(([args]) => args.where);
      expect(totalQuery).toMatchObject({ petId: 'pet-1', alertSent: true });
      expect(deviceQuery).toMatchObject({
        petId: 'pet-1',
        alertSent: true,
        deviceId,
      });
      const since = totalQuery.timestamp.gte.getTime();
      expect(before - since).toBeGreaterThanOrEqual(30 * 60 * 1000 - 50);
      expect(before - since).toBeLessThanOrEqual(30 * 60 * 1000 + 50);
    });

    it('skips the alert when this device already triggered 3 alerts', async () => {
      mockAlertCounts(3, 3);

      const result = await service.processScan({ ...scanDto, deviceId });

      expect(email.send).not.toHaveBeenCalled();
      expect(callMeBot.send).not.toHaveBeenCalled();
      expect(createdScanData()).toMatchObject({
        deviceId,
        alertSent: false,
      });
      expect(result.ownerNotified).toBe(false);
    });

    it('still alerts for a different device while another one is limited', async () => {
      mockAlertCounts(3, 0);

      const result = await service.processScan({ ...scanDto, deviceId });

      expect(email.send).toHaveBeenCalledTimes(1);
      expect(result.ownerNotified).toBe(true);
    });

    it('skips the alert when the pet already has 10 alerts across all devices', async () => {
      mockAlertCounts(10, 0);

      const result = await service.processScan({ ...scanDto, deviceId });

      expect(email.send).not.toHaveBeenCalled();
      expect(result.ownerNotified).toBe(false);
    });

    it('applies only the pet-wide cap when no deviceId is sent', async () => {
      prisma.scanLog.count.mockResolvedValueOnce(5);

      const result = await service.processScan(scanDto);

      expect(prisma.scanLog.count).toHaveBeenCalledTimes(1);
      expect(email.send).toHaveBeenCalledTimes(1);
      expect(result.ownerNotified).toBe(true);
    });

    it('keeps the owner contact in the response even when the alert is skipped', async () => {
      mockAlertCounts(10, 3);

      const result = await service.processScan({ ...scanDto, deviceId });

      expect(result.owner.name).toBe('Roberto');
      expect(result.owner.whatsappHref).toBe('https://wa.me/5511999999999');
    });

    it('does not query the limit or alert when the pet is not LOST', async () => {
      prisma.pet.findUnique.mockResolvedValue({
        ...basePet,
        status: PetStatus.SAFE,
      });

      const result = await service.processScan({ ...scanDto, deviceId });

      expect(prisma.scanLog.count).not.toHaveBeenCalled();
      expect(createdScanData()).toMatchObject({
        deviceId,
        alertSent: false,
      });
      expect(result.ownerNotified).toBe(false);
    });
  });
});
