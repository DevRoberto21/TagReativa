import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { ScanService } from './scan.service';
import { PrismaService } from '../prisma/prisma.service';
import { TelegramService } from '../telegram/telegram.service';
import { EmailService } from '../email/email.service';
import { NotificationChannel, PetStatus, LocationSource } from '@prisma/client';

describe('ScanService', () => {
  let service: ScanService;
  let prisma: {
    pet: { findUnique: jest.Mock };
    scanLog: { create: jest.Mock; count: jest.Mock; update: jest.Mock };
    notification: { create: jest.Mock };
    $executeRaw: jest.Mock;
    $transaction: jest.Mock;
  };
  let telegram: { sendMessage: jest.Mock; sendLocation: jest.Mock };
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
      telegramChatId: '42',
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
      scanLog: { create: jest.fn(), count: jest.fn(), update: jest.fn() },
      notification: { create: jest.fn() },
      $executeRaw: jest.fn().mockResolvedValue(1),
      $transaction: jest.fn(),
    };
    prisma.$transaction.mockImplementation(
      (fn: (tx: typeof prisma) => Promise<unknown>) => fn(prisma),
    );
    telegram = {
      sendMessage: jest.fn(),
      sendLocation: jest.fn().mockResolvedValue(true),
    };
    email = { send: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ScanService,
        { provide: PrismaService, useValue: prisma },
        { provide: TelegramService, useValue: telegram },
        { provide: EmailService, useValue: email },
      ],
    }).compile();

    service = module.get<ScanService>(ScanService);

    prisma.scanLog.create.mockResolvedValue(createdScanLog);
    prisma.scanLog.count.mockResolvedValue(0);
    prisma.scanLog.update.mockResolvedValue({});
    prisma.notification.create.mockResolvedValue({});
  });

  it('throws NotFoundException when the pet does not exist', async () => {
    prisma.pet.findUnique.mockResolvedValue(null);

    await expect(service.processScan(scanDto)).rejects.toThrow(
      NotFoundException,
    );
    expect(telegram.sendMessage).not.toHaveBeenCalled();
    expect(email.send).not.toHaveBeenCalled();
  });

  it('looks the pet up by short code, ignoring case', async () => {
    prisma.pet.findUnique.mockResolvedValue(basePet);

    await service.processScan({ ...scanDto, petId: 'k7m2x9qp' });

    expect(prisma.pet.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { shortCode: 'K7M2X9QP' } }),
    );
  });

  it('looks the pet up by id when the tag carries a UUID', async () => {
    const petId = '3f2b8c1e-9a4d-4e7b-b1c2-5d6e7f8a9b0c';
    prisma.pet.findUnique.mockResolvedValue(basePet);

    await service.processScan({ ...scanDto, petId });

    expect(prisma.pet.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: petId } }),
    );
  });

  it('dispatches both Telegram and Email when the pet is LOST', async () => {
    prisma.pet.findUnique.mockResolvedValue(basePet);
    telegram.sendMessage.mockResolvedValue(true);
    email.send.mockResolvedValue(true);

    await service.processScan(scanDto);

    expect(telegram.sendMessage).toHaveBeenCalledWith(
      basePet.owner.telegramChatId,
      expect.stringContaining('Rex'),
    );
    expect(email.send).toHaveBeenCalledWith(
      basePet.owner.email,
      expect.any(String),
      expect.any(String),
    );
    expect(prisma.notification.create).toHaveBeenCalledWith({
      data: {
        scanLogId: createdScanLog.id,
        channel: NotificationChannel.TELEGRAM,
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

      expect(telegram.sendMessage).not.toHaveBeenCalled();
      expect(email.send).not.toHaveBeenCalled();
      expect(prisma.notification.create).not.toHaveBeenCalled();
    },
  );

  it('still sends Email and returns normally when Telegram delivery fails', async () => {
    prisma.pet.findUnique.mockResolvedValue(basePet);
    telegram.sendMessage.mockResolvedValue(false);
    email.send.mockResolvedValue(true);

    const result = await service.processScan(scanDto);

    expect(email.send).toHaveBeenCalledTimes(1);
    expect(prisma.notification.create).toHaveBeenCalledWith({
      data: {
        scanLogId: createdScanLog.id,
        channel: NotificationChannel.TELEGRAM,
        delivered: false,
      },
    });
    expect(result.pet.name).toBe('Rex');
  });

  it('still sends Telegram and does not throw when Email send rejects', async () => {
    prisma.pet.findUnique.mockResolvedValue(basePet);
    telegram.sendMessage.mockResolvedValue(true);
    email.send.mockRejectedValue(new Error('Brevo down'));

    await expect(service.processScan(scanDto)).resolves.toBeDefined();

    expect(telegram.sendMessage).toHaveBeenCalledTimes(1);
    expect(prisma.notification.create).toHaveBeenCalledWith({
      data: {
        scanLogId: createdScanLog.id,
        channel: NotificationChannel.TELEGRAM,
        delivered: true,
      },
    });
    expect(prisma.notification.create).toHaveBeenCalledTimes(1);
  });

  it('returns normally when both channels fail', async () => {
    prisma.pet.findUnique.mockResolvedValue(basePet);
    telegram.sendMessage.mockResolvedValue(false);
    email.send.mockRejectedValue(new Error('Brevo down'));

    await expect(service.processScan(scanDto)).resolves.toBeDefined();

    expect(prisma.notification.create).toHaveBeenCalledTimes(1);
    expect(prisma.notification.create).toHaveBeenCalledWith({
      data: {
        scanLogId: createdScanLog.id,
        channel: NotificationChannel.TELEGRAM,
        delivered: false,
      },
    });
  });

  it('creates exactly one notification row per channel (no duplicates)', async () => {
    prisma.pet.findUnique.mockResolvedValue(basePet);
    telegram.sendMessage.mockResolvedValue(true);
    email.send.mockResolvedValue(true);

    await service.processScan(scanDto);

    const channelsCreated = prisma.notification.create.mock.calls.map(
      (call) => call[0].data.channel,
    );
    expect(channelsCreated.sort()).toEqual(
      [NotificationChannel.EMAIL, NotificationChannel.TELEGRAM].sort(),
    );
  });

  describe('Telegram location pin', () => {
    beforeEach(() => {
      prisma.pet.findUnique.mockResolvedValue(basePet);
      telegram.sendMessage.mockResolvedValue(true);
      email.send.mockResolvedValue(true);
    });

    it('sends the GPS location after the text message', async () => {
      await service.processScan({
        ...scanDto,
        consentGranted: true,
        latitude: -8.05,
        longitude: -34.9,
      });

      expect(telegram.sendLocation).toHaveBeenCalledWith('42', -8.05, -34.9);
      const textOrder = telegram.sendMessage.mock.invocationCallOrder[0];
      const pinOrder = telegram.sendLocation.mock.invocationCallOrder[0];
      expect(textOrder).toBeLessThan(pinOrder);
    });

    it('does not send a location when none could be resolved', async () => {
      await service.processScan(scanDto);

      expect(telegram.sendMessage).toHaveBeenCalledTimes(1);
      expect(telegram.sendLocation).not.toHaveBeenCalled();
    });

    it('skips the location pin when the text message fails', async () => {
      telegram.sendMessage.mockResolvedValue(false);

      await service.processScan({
        ...scanDto,
        consentGranted: true,
        latitude: -8.05,
        longitude: -34.9,
      });

      expect(telegram.sendLocation).not.toHaveBeenCalled();
    });
  });

  it('sends only Email when the owner has not linked Telegram', async () => {
    prisma.pet.findUnique.mockResolvedValue({
      ...basePet,
      owner: { ...basePet.owner, telegramChatId: null },
    });
    email.send.mockResolvedValue(true);

    await service.processScan(scanDto);

    expect(telegram.sendMessage).not.toHaveBeenCalled();
    expect(email.send).toHaveBeenCalledTimes(1);
    expect(prisma.notification.create).toHaveBeenCalledTimes(1);
  });

  it('bounds the IP geolocation lookup with a timeout', async () => {
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue({
      json: () => Promise.resolve({ status: 'success', lat: 1, lon: 2 }),
    } as Response);
    prisma.pet.findUnique.mockResolvedValue(basePet);

    await service.processScan({
      ...scanDto,
      consentGranted: true,
      ipAddress: '203.0.113.9',
    });

    expect(fetchMock).toHaveBeenCalledWith(
      'http://ip-api.com/json/203.0.113.9',
      { signal: expect.any(AbortSignal) as AbortSignal },
    );
    fetchMock.mockRestore();
  });

  describe('IP geolocation lookup', () => {
    let fetchMock: jest.SpyInstance;
    const publicScan = {
      ...scanDto,
      consentGranted: true,
      ipAddress: '203.0.113.9',
    };

    beforeEach(() => {
      fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue({
        json: () => Promise.resolve({ status: 'success', lat: 1, lon: 2 }),
      } as Response);
      prisma.pet.findUnique.mockResolvedValue(basePet);
    });

    afterEach(() => fetchMock.mockRestore());

    it('looks the address up when an alert will be sent', async () => {
      await service.processScan(publicScan);

      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('skips the lookup when the pet is not LOST', async () => {
      prisma.pet.findUnique.mockResolvedValue({
        ...basePet,
        status: PetStatus.SAFE,
      });

      await service.processScan(publicScan);

      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('skips the lookup without consent', async () => {
      await service.processScan({ ...publicScan, consentGranted: false });

      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('skips the lookup when the alert cap is reached', async () => {
      prisma.scanLog.count.mockResolvedValue(10);

      await service.processScan(publicScan);

      expect(fetchMock).not.toHaveBeenCalled();
    });

    it.each([
      '127.0.0.1',
      '::1',
      '10.1.2.3',
      '172.16.0.1',
      '192.168.0.1',
      '169.254.1.1',
      '::ffff:10.0.0.1',
      '::ffff:192.168.1.1',
      '::FFFF:127.0.0.1',
      'fe80::1',
      'fc00::1',
      'fd12:3456::1',
    ])('never sends the private address %s to ip-api', async (ipAddress) => {
      await service.processScan({ ...publicScan, ipAddress });

      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('stores the resolved address on the scan log after the transaction', async () => {
      await service.processScan(publicScan);

      expect(prisma.scanLog.update).toHaveBeenCalledWith({
        where: { id: createdScanLog.id },
        data: { latitude: 1, longitude: 2 },
      });
      expect(fetchMock.mock.invocationCallOrder[0]).toBeGreaterThan(
        prisma.$transaction.mock.invocationCallOrder[0],
      );
      expect(fetchMock.mock.invocationCallOrder[0]).toBeGreaterThan(
        prisma.scanLog.create.mock.invocationCallOrder[0],
      );
    });

    it('still alerts when storing the resolved address fails', async () => {
      prisma.scanLog.update.mockRejectedValue(new Error('db down'));
      jest.spyOn(console, 'error').mockImplementation(() => {});
      email.send.mockResolvedValue(true);

      const result = await service.processScan(publicScan);

      expect(email.send).toHaveBeenCalledTimes(1);
      expect(result.ownerNotified).toBe(true);
    });

    it('still looks up an IPv4-mapped public address', async () => {
      await service.processScan({
        ...publicScan,
        ipAddress: '::ffff:203.0.113.9',
      });

      expect(fetchMock).toHaveBeenCalledTimes(1);
    });
  });

  it('tells the owner the finder location is not verified', async () => {
    prisma.pet.findUnique.mockResolvedValue(basePet);
    telegram.sendMessage.mockResolvedValue(true);
    email.send.mockResolvedValue(true);

    await service.processScan({
      ...scanDto,
      consentGranted: true,
      latitude: -8.05,
      longitude: -34.9,
    });

    const [, text] = telegram.sendMessage.mock.calls[0] as [string, string];
    expect(text).toContain('informada pelo aparelho de quem leu a tag');
    expect(text).toContain('não verificada');
    expect(text).not.toContain('Localização GPS');
    expect(email.send).toHaveBeenCalledWith(
      'owner@example.com',
      expect.any(String),
      text,
    );
  });

  describe('alert rate limit', () => {
    const deviceId = '8f14e45f-ceea-467a-9575-0c5b0b0b7c11';

    // count() is called for the pet-wide total first, then for the source
    // address, then for the device.
    function mockAlertCounts(total: number, device: number, source = 0) {
      prisma.scanLog.count
        .mockResolvedValueOnce(total)
        .mockResolvedValueOnce(source)
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
      telegram.sendMessage.mockResolvedValue(true);
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
      const [totalQuery, sourceQuery, deviceQuery] = (
        prisma.scanLog.count.mock.calls as CountArgs[]
      ).map(([args]) => args.where);
      expect(totalQuery).toMatchObject({ petId: 'pet-1', alertSent: true });
      expect(sourceQuery).toMatchObject({
        petId: 'pet-1',
        alertSent: true,
        ipAddress: '127.0.0.1',
      });
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
      expect(telegram.sendMessage).not.toHaveBeenCalled();
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

    it('applies the pet-wide and per-address caps when no deviceId is sent', async () => {
      prisma.scanLog.count.mockResolvedValueOnce(5).mockResolvedValueOnce(0);

      const result = await service.processScan(scanDto);

      expect(prisma.scanLog.count).toHaveBeenCalledTimes(2);
      expect(email.send).toHaveBeenCalledTimes(1);
      expect(result.ownerNotified).toBe(true);
    });

    it('skips the alert when this address already triggered 3 alerts, even without deviceId', async () => {
      prisma.scanLog.count.mockResolvedValueOnce(3).mockResolvedValueOnce(3);

      const result = await service.processScan(scanDto);

      expect(email.send).not.toHaveBeenCalled();
      expect(telegram.sendMessage).not.toHaveBeenCalled();
      expect(result.ownerNotified).toBe(false);
    });

    it('does not let a fresh deviceId bypass the per-address cap', async () => {
      mockAlertCounts(3, 0, 3);

      const result = await service.processScan({ ...scanDto, deviceId });

      expect(email.send).not.toHaveBeenCalled();
      expect(result.ownerNotified).toBe(false);
    });

    it('keeps the owner contact in the response even when the alert is skipped', async () => {
      mockAlertCounts(10, 3);

      const result = await service.processScan({ ...scanDto, deviceId });

      expect(result.owner.name).toBe('Roberto');
      expect(result.owner.whatsappHref).toBe('https://wa.me/5511999999999');
    });

    it('locks the pet before counting and inserting, in one transaction', async () => {
      mockAlertCounts(0, 0);

      await service.processScan({ ...scanDto, deviceId });

      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      const [strings, ...values] = prisma.$executeRaw.mock.calls[0] as [
        TemplateStringsArray,
        ...unknown[],
      ];
      expect(strings.join('?')).toBe(
        'SELECT pg_advisory_xact_lock(hashtext(?))',
      );
      expect(values).toEqual(['pet-1']);
      const lock = prisma.$executeRaw.mock.invocationCallOrder[0];
      const counts = prisma.scanLog.count.mock.invocationCallOrder;
      const create = prisma.scanLog.create.mock.invocationCallOrder[0];
      expect(Math.min(...counts)).toBeGreaterThan(lock);
      expect(create).toBeGreaterThan(Math.max(...counts));
    });

    it('sends alerts only after the transaction commits', async () => {
      let committed = false;
      prisma.$transaction.mockImplementation(
        async (fn: (tx: typeof prisma) => Promise<unknown>) => {
          const result = await fn(prisma);
          committed = true;
          return result;
        },
      );
      email.send.mockImplementation(() => Promise.resolve(committed));

      const result = await service.processScan({ ...scanDto, deviceId });

      expect(await email.send.mock.results[0].value).toBe(true);
      expect(result.ownerNotified).toBe(true);
    });

    it('does not query the limit or alert when the pet is not LOST', async () => {
      prisma.pet.findUnique.mockResolvedValue({
        ...basePet,
        status: PetStatus.SAFE,
      });

      const result = await service.processScan({ ...scanDto, deviceId });

      expect(prisma.scanLog.count).not.toHaveBeenCalled();
      expect(prisma.$executeRaw).not.toHaveBeenCalled();
      expect(createdScanData()).toMatchObject({
        deviceId,
        alertSent: false,
      });
      expect(result.ownerNotified).toBe(false);
    });
  });
});
