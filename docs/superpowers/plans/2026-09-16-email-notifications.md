# Email Notifications Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an email channel to the existing "pet found" notification flow so owners are notified by email in parallel with WhatsApp when a `LOST` pet is scanned.

**Architecture:** New `EmailModule`/`EmailService` mirrors the existing `CallMeBotModule`/`CallMeBotService` shape (a thin wrapper around a third-party send API, catches its own errors, returns `boolean`). `ScanService.processScan` dispatches both channels in parallel and persists one `Notification` row per channel, enabled by a schema change from a single-row-per-scan constraint to a single-row-per-scan-per-channel constraint.

**Tech Stack:** NestJS, Prisma/PostgreSQL, `@getbrevo/brevo` (Brevo transactional email SDK), Jest.

**Spec:** `docs/superpowers/specs/2026-09-14-email-notifications-design.md`

> **Correction (post-implementation):** The Task 2 reference code below for `email.service.ts` and its spec (targeting `TransactionalEmailsApi`/`SendSmtpEmail`) does not match the installed `@getbrevo/brevo@6.0.3` SDK and was superseded by commit `5ed78f3`, which rewrote the service around `BrevoClient`. Do not replay the reference code below as-is; use `src/email/email.service.ts` and `src/email/email.service.spec.ts` on this branch as the correct implementation.

## Global Constraints

- Email provider is Brevo, using single-sender verification (no custom domain yet) — per spec, this is correct for now; do not substitute Resend or add domain/DKIM setup.
- Every `User.email` is a notification recipient automatically — no opt-in/opt-out field, no per-user toggle.
- Trigger condition for email is identical to WhatsApp's: only when `pet.status === 'LOST'`.
- Email body is plain text, reusing the exact same message copy already used for WhatsApp — no HTML template.
- A failed send (either channel) must never throw out of `processScan` and must never block the other channel — log via `console.error`, no retries, no queue.
- `Notification` must allow one row per `(scanLogId, channel)` pair, not one row per `scanLogId`.

---

## File Structure

- `prisma/schema.prisma` — modify: `Notification.scanLogId` loses column-level `@unique`, gains `@@unique([scanLogId, channel])`; `ScanLog.notification` (singular) becomes `ScanLog.notifications` (array).
- `src/email/email.service.ts` — new: `EmailService.send(to, subject, message): Promise<boolean>`, wraps Brevo SDK.
- `src/email/email.service.spec.ts` — new: unit tests for `EmailService`.
- `src/email/email.module.ts` — new: exports `EmailService`, mirrors `CallMeBotModule`.
- `src/scan/scan.module.ts` — modify: import `EmailModule`.
- `src/scan/scan.service.ts` — modify: inject `EmailService`, dispatch WhatsApp + Email in parallel, persist one `Notification` row per channel.
- `src/scan/scan.service.spec.ts` — modify (full rewrite): real coverage for both channels, replacing the current `should be defined`-only stub.
- `.env` — modify (local only, gitignored): add `BREVO_API_KEY`, `BREVO_SENDER_EMAIL`.
- `package.json` — modify: add `@getbrevo/brevo` dependency.

---

### Task 1: Notification schema — allow one row per channel per scan

**Files:**
- Modify: `prisma/schema.prisma:64` (`ScanLog.notification`), `prisma/schema.prisma:67-74` (`Notification` model)

**Interfaces:**
- Produces: `Notification` rows are no longer 1:1 with `ScanLog` — callers may create up to one row per `(scanLogId, channel)` pair. `ScanLog.notifications` is now an array relation (was `ScanLog.notification`, singular optional).

- [ ] **Step 1: Edit the schema**

In `prisma/schema.prisma`, change line 64 from:

```prisma
  notification   Notification?
```

to:

```prisma
  notifications  Notification[]
```

Change the `Notification` model (lines 67-74) from:

```prisma
model Notification {
  id        String              @id @default(uuid())
  scanLogId String              @unique
  scanLog   ScanLog             @relation(fields: [scanLogId], references: [id], onDelete: Cascade)
  channel   NotificationChannel
  sentAt    DateTime            @default(now())
  delivered Boolean             @default(false)
}
```

to:

```prisma
model Notification {
  id        String              @id @default(uuid())
  scanLogId String
  scanLog   ScanLog             @relation(fields: [scanLogId], references: [id], onDelete: Cascade)
  channel   NotificationChannel
  sentAt    DateTime            @default(now())
  delivered Boolean             @default(false)

  @@unique([scanLogId, channel])
}
```

- [ ] **Step 2: Generate and apply the migration**

Run: `npx prisma migrate dev --name notification_channel_unique`

Expected: prompt-free success output ending in `Your database is now in sync with your schema.` and a new folder under `prisma/migrations/` containing a `migration.sql` that drops the old unique index on `scanLogId` and adds a unique index on `(scanLogId, channel)`.

- [ ] **Step 3: Verify the generated Prisma client**

Run: `grep -n "notifications" node_modules/.prisma/client/index.d.ts | head -5`

Expected: at least one match showing `notifications` (plural) on the `ScanLog` payload types. If it still says `notification` (singular), run `npx prisma generate` and check again.

- [ ] **Step 4: Confirm nothing else references the old singular relation**

Run: `grep -rn "\.notification\b" src frontend/src`

Expected: no output (already confirmed clean during spec research on 2026-09-14; this re-check guards against drift).

- [ ] **Step 5: Commit**

```bash
git add prisma/schema.prisma prisma/migrations
git commit -m "feat: allow one notification row per channel per scan"
```

---

### Task 2: EmailService — Brevo integration

**Files:**
- Create: `src/email/email.service.ts`
- Create: `src/email/email.service.spec.ts`
- Create: `src/email/email.module.ts`
- Modify: `.env` (local, gitignored — add `BREVO_API_KEY`, `BREVO_SENDER_EMAIL`)
- Modify: `package.json` (add `@getbrevo/brevo` dependency, via install command below)

**Interfaces:**
- Produces: `EmailService.send(to: string, subject: string, message: string): Promise<boolean>` — resolves `true` on successful send, `false` on any failure (network error, API error). Never throws. `EmailModule` exports `EmailService` for other modules to import.

- [ ] **Step 1: Install the Brevo SDK**

Run: `npm install @getbrevo/brevo`

- [ ] **Step 2: Add local env vars**

Add these two lines to `.env` (this file is gitignored — do not commit it):

```
BREVO_API_KEY=your-brevo-api-key-here
BREVO_SENDER_EMAIL=your-single-verified-sender@example.com
```

Get the real values from the Brevo dashboard: API key under SMTP & API → API Keys; sender email is the address you verified via Brevo's single-sender confirmation link (Senders, Domains & Dedicated IPs → Senders).

- [ ] **Step 3: Write the failing test**

Create `src/email/email.service.spec.ts`:

```typescript
import { Test, TestingModule } from '@nestjs/testing';
import { EmailService } from './email.service';

const sendTransacEmail = jest.fn();
const setApiKey = jest.fn();

jest.mock('@getbrevo/brevo', () => ({
  TransactionalEmailsApi: jest.fn().mockImplementation(() => ({
    setApiKey,
    sendTransacEmail,
  })),
  TransactionalEmailsApiApiKeys: { apiKey: 'apiKey' },
  SendSmtpEmail: jest.fn().mockImplementation(() => ({})),
}));

describe('EmailService', () => {
  let service: EmailService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [EmailService],
    }).compile();

    service = module.get<EmailService>(EmailService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('returns true when Brevo accepts the email', async () => {
    sendTransacEmail.mockResolvedValueOnce({});

    const result = await service.send(
      'owner@example.com',
      'Assunto',
      'Corpo da mensagem',
    );

    expect(result).toBe(true);
    expect(sendTransacEmail).toHaveBeenCalledTimes(1);
  });

  it('returns false when Brevo rejects the send', async () => {
    sendTransacEmail.mockRejectedValueOnce(new Error('Brevo API error'));

    const result = await service.send(
      'owner@example.com',
      'Assunto',
      'Corpo da mensagem',
    );

    expect(result).toBe(false);
  });
});
```

- [ ] **Step 4: Run the test to verify it fails**

Run: `npm test -- email.service.spec.ts`

Expected: FAIL — `Cannot find module './email.service'` (the file doesn't exist yet).

- [ ] **Step 5: Write the minimal implementation**

Create `src/email/email.service.ts`:

```typescript
import { Injectable } from '@nestjs/common';
import * as brevo from '@getbrevo/brevo';

@Injectable()
export class EmailService {
  private readonly apiInstance: brevo.TransactionalEmailsApi;

  constructor() {
    this.apiInstance = new brevo.TransactionalEmailsApi();
    this.apiInstance.setApiKey(
      brevo.TransactionalEmailsApiApiKeys.apiKey,
      process.env.BREVO_API_KEY ?? '',
    );
  }

  async send(to: string, subject: string, message: string): Promise<boolean> {
    const email = new brevo.SendSmtpEmail();
    email.subject = subject;
    email.textContent = message;
    email.sender = {
      email: process.env.BREVO_SENDER_EMAIL ?? '',
      name: 'TagReativa',
    };
    email.to = [{ email: to }];

    try {
      await this.apiInstance.sendTransacEmail(email);
      return true;
    } catch (err) {
      console.error('[EMAIL] erro:', err);
      return false;
    }
  }
}
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `npm test -- email.service.spec.ts`

Expected: PASS — 3 tests passing.

- [ ] **Step 7: Create the module**

Create `src/email/email.module.ts`:

```typescript
import { Module } from '@nestjs/common';
import { EmailService } from './email.service';

@Module({
  providers: [EmailService],
  exports: [EmailService],
})
export class EmailModule {}
```

- [ ] **Step 8: Commit**

```bash
git add src/email package.json package-lock.json
git commit -m "feat: add EmailService with Brevo transactional email integration"
```

Note: `.env` is gitignored and is not part of this commit — verify with `git status` that it does not appear staged.

---

### Task 3: Wire email into the scan notification flow

**Files:**
- Modify: `src/scan/scan.module.ts:1-11`
- Modify: `src/scan/scan.service.ts:1-131`
- Modify: `src/scan/scan.service.spec.ts:1-18` (full rewrite)

**Interfaces:**
- Consumes: `EmailService.send(to: string, subject: string, message: string): Promise<boolean>` (Task 2). `CallMeBotService.send(whatsapp: string, apiKey: string, message: string): Promise<boolean>` (existing, unchanged).
- Produces: `ScanService.processScan(dto: ScanDto)` — same return shape as before (unchanged), now triggers both notification channels when `pet.status === 'LOST'`.

- [ ] **Step 1: Wire `EmailModule` into `ScanModule`**

In `src/scan/scan.module.ts`, change:

```typescript
import { Module } from '@nestjs/common';
import { ScanService } from './scan.service';
import { ScanController } from './scan.controller';
import { CallMeBotModule } from '../callmebot/callmebot.module';

@Module({
  imports: [CallMeBotModule],
  providers: [ScanService],
  controllers: [ScanController],
})
export class ScanModule {}
```

to:

```typescript
import { Module } from '@nestjs/common';
import { ScanService } from './scan.service';
import { ScanController } from './scan.controller';
import { CallMeBotModule } from '../callmebot/callmebot.module';
import { EmailModule } from '../email/email.module';

@Module({
  imports: [CallMeBotModule, EmailModule],
  providers: [ScanService],
  controllers: [ScanController],
})
export class ScanModule {}
```

- [ ] **Step 2: Write the failing test suite**

Replace all of `src/scan/scan.service.spec.ts` with:

```typescript
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
    scanLog: { create: jest.Mock };
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
      scanLog: { create: jest.fn() },
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
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npm test -- scan.service.spec.ts`

Expected: FAIL — `Nest can't resolve dependencies of the ScanService` or similar, since `ScanService` doesn't yet accept an `EmailService` and the current implementation only ever calls `callMeBot.send` once per scan (no `email.send` calls, wrong `notification.create` call count).

- [ ] **Step 4: Rewrite the implementation**

Replace all of `src/scan/scan.service.ts` with:

```typescript
import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CallMeBotService } from '../callmebot/callmebot.service';
import { EmailService } from '../email/email.service';
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
  status: string;
  lat: number;
  lon: number;
}

@Injectable()
export class ScanService {
  constructor(
    private prisma: PrismaService,
    private callMeBot: CallMeBotService,
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

  private async notifyWhatsapp(
    scanLogId: string,
    whatsapp: string,
    apiKey: string,
    message: string,
  ): Promise<void> {
    let delivered: boolean;
    try {
      delivered = await this.callMeBot.send(whatsapp, apiKey, message);
    } catch (err: unknown) {
      console.error('[Notification] Falha ao enviar WhatsApp:', err);
      return;
    }
    await this.persistNotification(
      scanLogId,
      NotificationChannel.WHATSAPP,
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

    if (pet.status === 'LOST') {
      const hasLocation = latitude != null && longitude != null;
      const isGps = locationSource === LocationSource.GPS;
      const message = hasLocation
        ? isGps
          ? `Seu pet ${pet.name} foi encontrado! 📍 Localização GPS: https://maps.google.com/?q=${latitude},${longitude}`
          : `Seu pet ${pet.name} foi encontrado! O resgatador negou o GPS. Endereço baseado no IP (pode estar impreciso): https://maps.google.com/?q=${latitude},${longitude}`
        : `Seu pet ${pet.name} foi encontrado! Não foi possível obter localização.`;

      const dispatches: Promise<void>[] = [];

      if (pet.owner.callMeBotApiKey) {
        dispatches.push(
          this.notifyWhatsapp(
            scanLog.id,
            pet.owner.whatsapp,
            pet.owner.callMeBotApiKey,
            message,
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
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npm test -- scan.service.spec.ts`

Expected: PASS — 8 tests passing (1 not-found, 1 both-channels, 2 status-skip via `it.each`, 1 whatsapp-fails, 1 email-rejects, 1 both-fail, 1 no-duplicates).

- [ ] **Step 6: Run the full test suite**

Run: `npm test`

Expected: PASS — all suites green, including `email.service.spec.ts` from Task 2 and every pre-existing spec file untouched by this plan.

- [ ] **Step 7: Commit**

```bash
git add src/scan
git commit -m "feat: dispatch email notifications alongside WhatsApp on pet scan"
```

---

### Task 4: Manual smoke test against real Brevo account

**Files:** none (manual verification only)

- [ ] **Step 1: Start the backend**

Run: `npm run start:dev`

Expected: server boots on port 3000 with no startup errors (confirms `EmailModule`/`EmailService` wire up cleanly with real env vars).

- [ ] **Step 2: Trigger a real scan against a LOST test pet**

Use an existing dev pet record with `status = LOST` and a real `owner.email` you can check inbox/spam folder for. Hit the scan endpoint the same way the frontend `ScanPage` does (check `frontend/src/hooks/useScan.js` for the exact request shape if needed), or use `curl` against `POST /scan/:petId` with a minimal body matching `ScanDto`.

Expected: response returns normally (same shape as before); within a few seconds, the test inbox (or its spam folder) receives an email with subject `Seu pet <name> foi encontrado!` and the same body text WhatsApp would have sent.

- [ ] **Step 3: Confirm both Notification rows were persisted**

Run: `npx prisma studio` (or query directly) and check the `Notification` table for the `ScanLog` just created — expect one row with `channel = WHATSAPP` and one with `channel = EMAIL` (or just `EMAIL` if the test pet has no `callMeBotApiKey`).

Expected: exactly one row per channel that actually fired, `delivered = true` for the email row if it landed (even in spam).

No commit for this task — it's verification only, not a code change.
