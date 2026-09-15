# Email Notifications — Design Spec

Date: 2026-09-14
Status: Approved by user, ready for implementation plan

## Context

TagReativa notifies a pet owner via WhatsApp (CallMeBot) when a `LOST` pet
gets scanned. This project adds a parallel email channel so the owner is
notified even without CallMeBot configured. This is sub-project 1 of 3
(Email → Auth hardening → Photo pipeline), prioritized first per user
request. Target: production-usable before end of October 2026 (TCC
deadline).

## Scope

In scope:
- Email channel for the existing "pet found" notification flow.
- Schema change to allow one `Notification` row per channel per scan.
- Test coverage for both WhatsApp and Email notification guarantees.

Out of scope (explicitly deferred):
- Custom domain / DKIM / SPF setup — noted as future work.
- HTML/branded email template — plain text only, matching WhatsApp copy.
- Retry queues or delivery guarantees beyond current best-effort pattern.
- Per-user opt-in/opt-out toggle for email notifications.
- Frontend changes — no UI currently displays notification channel/status.

## Provider decision

**Brevo** (not Resend). Reasoning: user has no custom domain yet and needs
real delivery to arbitrary recipient emails today, not just to a
self-owned test inbox. Resend's sandbox domain (`onboarding@resend.dev`)
only delivers to the Resend account owner's own address — it silently
fails for any other recipient, which does not satisfy "must actually
reach real users now." Brevo supports **single sender verification**:
confirm one email address via a link, no DNS/domain ownership required,
then send to any recipient. Free tier ~9,000 emails/month, well above the
user's 1,000/month floor. Deliverability may be weaker without a verified
domain (can land in spam) — acceptable per user, domain work is future
work.

SDK: `@getbrevo/brevo` (official Node SDK).

Env vars (added to `.env`, alongside existing `DATABASE_URL`,
`FRONTEND_URL`, `JWT_SECRET`):
- `BREVO_API_KEY`
- `BREVO_SENDER_EMAIL` (the single-sender-verified address)

This config is app-level, not per-user — unlike `callMeBotApiKey` which is
stored per `User`. Every owner's `User.email` (already required + unique)
is used as the recipient automatically; no opt-in field is added.

## Architecture

New `EmailModule` mirrors the existing `CallMeBotModule` shape exactly:

```
src/email/
  email.module.ts     // providers: [EmailService], exports: [EmailService]
  email.service.ts     // EmailService.send(to, subject, message): Promise<boolean>
```

`EmailService.send` wraps the Brevo SDK call, returns `boolean` (success/
failure) the same way `CallMeBotService.send` does — keeps the calling
code in `ScanService` symmetric between channels.

`ScanModule` imports both `CallMeBotModule` and `EmailModule` (same
pattern as the current single import).

## Schema change

Current `Notification.scanLogId` is `@unique`, meaning at most one
notification row can ever exist per scan — this blocks having both a
WHATSAPP and an EMAIL row for the same `ScanLog`. Fix: composite unique
constraint instead of a column-level one.

```prisma
model ScanLog {
  ...
  notifications Notification[]   // was: notification Notification?
}

model Notification {
  id        String              @id @default(uuid())
  scanLogId String              // @unique removed
  scanLog   ScanLog             @relation(fields: [scanLogId], references: [id], onDelete: Cascade)
  channel   NotificationChannel
  sentAt    DateTime            @default(now())
  delivered Boolean             @default(false)

  @@unique([scanLogId, channel])
}
```

Guarantees: at most one row per `(scan, channel)` pair — a retried insert
for the same channel on the same scan is rejected, not duplicated.
Requires a Prisma migration (`prisma migrate dev`). Confirmed via grep:
no frontend or other backend code reads the singular `scanLog.notification`
relation today, so this is an isolated change.

## Data flow (`ScanService.processScan`)

When `pet.status === 'LOST'` (same trigger condition as today, unchanged):

1. Build the notification message text — same copy currently used for
   WhatsApp (GPS/IP/no-location variants), reused verbatim as the email
   body. No separate template.
2. Dispatch both channels in parallel via `Promise.allSettled`:
   - `callMeBot.send(owner.whatsapp, owner.callMeBotApiKey, message)` —
     only if `owner.callMeBotApiKey` is set (unchanged existing guard).
   - `emailService.send(owner.email, subject, message)` — always, since
     `User.email` is mandatory (no opt-in gate).
3. Each channel persists its own `Notification` row independently, in its
   own `try/catch` (mirrors the existing pattern at
   `scan.service.ts:107-116`) — a failure to persist one channel's record
   must not affect the other's.
4. Scan response returned to the caller is unchanged regardless of
   notification outcome on either channel.

## Error handling

Matches the existing WhatsApp behavior exactly: a failed send (network
error, Brevo API error, rate limit) is caught, logged via
`console.error`, and does not throw — `processScan` always completes and
returns the scan result. No retry logic, no queue. This is a deliberate
scope cut given the October deadline; noted as a possible future
improvement, not built now.

## Test plan

`scan.service.spec.ts` currently only asserts `service` is defined — no
real coverage exists for the notification logic (for either channel).
This project adds real coverage, mocking `PrismaService`,
`CallMeBotService`, and `EmailService`:

1. Pet `LOST` + scan → both WhatsApp and Email are attempted.
2. Pet `SAFE` or `RESCUE_CONFIRMED` → neither channel is attempted.
3. WhatsApp send fails (`callMeBot.send` resolves `false`) → Email still
   sends; `Notification` row for WHATSAPP persists with `delivered:
   false`.
4. Email send fails (throws) → WhatsApp still sends; `processScan` does
   not throw, scan result still returned.
5. Both channels fail → `processScan` still resolves normally.
6. Exactly one `Notification` row is created per channel per scan
   (validates the new `@@unique([scanLogId, channel])` constraint is
   respected by the insert logic, not violated).

## Affected files

- `prisma/schema.prisma` (+ new migration)
- `src/email/email.module.ts` (new)
- `src/email/email.service.ts` (new)
- `src/scan/scan.module.ts` (import `EmailModule`)
- `src/scan/scan.service.ts` (parallel dispatch + per-channel persistence)
- `src/scan/scan.service.spec.ts` (new test cases)
- `.env` (`BREVO_API_KEY`, `BREVO_SENDER_EMAIL`)
- `package.json` (`@getbrevo/brevo` dependency)

## Future work (explicitly deferred, not in this project)

- Custom domain + DKIM/SPF verification for better deliverability.
- HTML/branded email template with pet photo and map link.
- Per-user notification channel preference.
- Retry/queue-based delivery guarantees.
