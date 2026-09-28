# Telegram Notifications — Design Spec

Date: 2026-09-28
Status: Approved by user, ready for implementation

## Context

Lost-pet alerts currently go out over email (Brevo) and WhatsApp through
CallMeBot. CallMeBot is an unofficial gateway: each owner must message a
Spanish phone number, wait for a personal API key and paste it into the
profile. Onboarding is fragile and delivery has no guarantee. The advisor
suggested replacing it with an official API (WhatsApp Cloud API or
Telegram Bot API).

Decision: **Telegram Bot API** replaces CallMeBot. Reasons: free, no Meta
Business verification or template approval, one-tap onboarding through a
deep link, and native `sendLocation` so the owner gets a map pin of the
scan. WhatsApp Cloud API stays as future work behind the same
`NotificationChannel` abstraction.

## Scope

In scope:
- Remove CallMeBot completely (module, test endpoint, `callMeBotApiKey`
  column, setup page copy).
- Telegram channel for the existing "pet found" alert, plus a location pin
  when coordinates exist.
- Account linking through `t.me/<bot>?start=<token>` deep links.
- Unlinking from the profile page and via `/stop` in the chat.
- Webhook delivery in production, long polling in local development.

Out of scope:
- WhatsApp Cloud API.
- Inline buttons in the alert (e.g. "mark as found").
- Retry queues beyond the current best-effort pattern.

The `wa.me` button on the scan page (finder contacts owner directly) is
not an API integration and stays unchanged.

## Data model

- `User.telegramChatId String? @unique`, `User.telegramLinkedAt DateTime?`.
- `User.callMeBotApiKey` dropped. Owners who used it lose WhatsApp alerts
  until they link Telegram; email keeps working.
- `NotificationChannel` gains `TELEGRAM`. `WHATSAPP` is kept because
  existing `Notification` rows reference it.
- New `TelegramLinkToken { id, userId, tokenHash @unique, expiresAt,
  usedAt?, createdAt }`, same shape as `PasswordResetToken`.

## Linking flow

1. `POST /telegram/link` (JWT) deletes the user's unused tokens, creates a
   32-byte base64url token (43 chars, within Telegram's 64-char `start`
   limit), stores its SHA-256 hash with a 15 minute expiry and returns
   `{ url: "https://t.me/<TELEGRAM_BOT_USERNAME>?start=<token>" }`.
2. The frontend opens the URL. The owner taps "Start" in Telegram.
3. Telegram delivers `/start <token>` to the backend. The backend accepts
   it only from private chats, looks up the hash, rejects used or expired
   tokens, then in one transaction clears that `chatId` from any other
   user, sets `telegramChatId` + `telegramLinkedAt` and marks the token
   used. The bot replies with a confirmation.
4. The setup page polls `GET /users/me` every 3 s until
   `telegramLinked: true`. `findMe` never exposes the raw `chatId`.

Unlinking: `DELETE /telegram/link` (JWT) or `/stop` in the chat clears
`telegramChatId` and `telegramLinkedAt`.

## Update delivery

- `TELEGRAM_WEBHOOK_URL` set: on boot the backend calls `setWebhook` with
  `secret_token = TELEGRAM_WEBHOOK_SECRET`. `POST /telegram/webhook`
  rejects requests whose `X-Telegram-Bot-Api-Secret-Token` header does not
  match (constant-time compare) and skips the global throttler, since all
  updates come from Telegram's few IPs.
- `TELEGRAM_WEBHOOK_URL` unset: on boot the backend calls `deleteWebhook`
  and long-polls `getUpdates`. Used for local development.

## Alert dispatch

`ScanService` replaces `notifyWhatsapp` with `notifyTelegram`: when the
owner has a `telegramChatId`, send the same text message used for email,
then `sendLocation` if latitude and longitude exist. `delivered` reflects
the text message. The notification row uses channel `TELEGRAM`.

If Telegram answers 403 (owner blocked the bot), `TelegramService` clears
that `chatId` so later scans skip Telegram.

## Configuration

- `TELEGRAM_BOT_TOKEN` (required, boot fails without it)
- `TELEGRAM_BOT_USERNAME` (required)
- `TELEGRAM_WEBHOOK_URL` (optional; production only)
- `TELEGRAM_WEBHOOK_SECRET` (required when `TELEGRAM_WEBHOOK_URL` is set)

## Tests

- `TelegramService`: success, HTTP failure, network error, 403 clears
  `chatId`.
- `TelegramLinkService`: link URL creation, valid `/start`, expired token,
  reused token, unknown token, non-private chat ignored, `/stop` unlinks.
- `TelegramController`: webhook rejects a wrong secret.
- `ScanService`: Telegram + location when linked, no `sendLocation`
  without coordinates, email only when not linked, failures isolated
  between channels.
- `UsersService.findMe`: returns `telegramLinked`.
