# Two-Factor Authentication (Email OTP) — Design Spec

Date: 2026-09-16
Status: Approved by user, ready for implementation plan

## Context

TagReativa's auth is single-step email+password → JWT
(`src/auth/auth.service.ts`). This is sub-project 2b of the roadmap agreed
during the email-notifications brainstorming session (Email → Auth
hardening → Photo pipeline); within Auth hardening, password recovery
(sub-project 2a) is done, and this is 2FA. Target: production-usable
before end of October 2026 (TCC deadline).

## Scope

In scope:
- Opt-in email-OTP two-factor authentication: a user enables it from their
  profile; once enabled, login requires a 6-digit code sent by email in
  addition to the password.
- Backend: modified `POST /auth/login`, new
  `POST /auth/login/verify-2fa`, `POST /auth/2fa/enable`,
  `POST /auth/2fa/confirm`, `POST /auth/2fa/disable`.
- Frontend: a second inline step on the Login page when a code is
  required, and a 2FA section on the Profile page to enable/disable it.

Out of scope (explicitly deferred):
- TOTP/authenticator-app-based 2FA, SMS-based 2FA — email OTP only.
- Mandatory 2FA for all users — opt-in only, no forced rollout.
- Backup/recovery codes for when a user can't receive the email. If a user
  loses access to their email entirely, they're already locked out of
  password recovery too (same channel) — no new gap introduced, not
  solved here either.
- A dedicated "resend code" endpoint — re-submitting the login form (or
  re-triggering enable) naturally issues a fresh code via the existing
  delete-prior-pending-code step, so a separate endpoint is redundant.
- `trust proxy` / rate-limit topology fixes — tracked separately as a
  pre-existing, deploy-time item (see project memory), not part of this
  feature.

## Architecture

New Prisma model `TwoFactorCode`, serving two purposes distinguished by
whether `loginTokenHash` is set:

```prisma
model TwoFactorCode {
  id             String    @id @default(uuid())
  userId         String
  user           User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  loginTokenHash String?   @unique
  codeHash       String
  expiresAt      DateTime
  attempts       Int       @default(0)
  usedAt         DateTime?
  createdAt      DateTime  @default(now())
}
```

- **Login-flow codes** (`loginTokenHash` set): issued when a user with
  2FA enabled submits correct credentials. The user isn't authenticated
  yet, so a random opaque `loginToken` (32 random bytes, hex) is returned
  to the client to identify this pending login attempt; only its SHA-256
  hash is stored, exactly mirroring `PasswordResetToken`'s token-hashing
  convention.
- **Enable-confirmation codes** (`loginTokenHash` null): issued when an
  already-authenticated user (valid JWT) requests to turn 2FA on. No
  `loginToken` is needed — the JWT already proves identity, so the row is
  looked up by `userId` directly.

Both purposes reuse the exact same "generate 6-digit code via
`crypto.randomInt(100000, 1000000)`, SHA-256-hash it, store the hash,
email the raw code, delete any prior pending code of the same purpose for
that user first" primitive, living in `AuthService` (which already has
`PrismaService` and `EmailService` injected from the password-recovery
work).

`User` gains `twoFactorEnabled Boolean @default(false)` and
`twoFactorCodes TwoFactorCode[]`.

**Why all 2FA routes live on `AuthController`, not `UsersController`:**
`AuthModule` already imports `UsersModule` and `EmailModule`; the reverse
(`UsersModule` importing `AuthModule` to get `AuthService`) would be
circular. Since enabling/disabling 2FA needs the same code-issuance and
email logic as login verification, all five routes
(`login`, `login/verify-2fa`, `2fa/enable`, `2fa/confirm`, `2fa/disable`)
live on `AuthController`, even though enable/disable are user-profile
actions conceptually. `GET /users/me` (existing, `UsersService.findMe`)
gains `twoFactorEnabled` in its selected fields so the frontend can show
current status.

## Data flow

**Login with 2FA enabled:**

1. `POST /auth/login {email, password}` validates credentials exactly as
   today. If valid and `user.twoFactorEnabled` is `false`: unchanged
   behavior, returns `{ access_token }` immediately.
2. If valid and `user.twoFactorEnabled` is `true`: deletes any prior
   pending login-flow code for that user, generates a new 6-digit code +
   `loginToken`, stores the code's hash keyed by the login token's hash
   with `expiresAt = now + 5 minutes`, emails the raw code (plain text,
   fire-and-forget with `.then()`/`.catch()` logging on failure —
   matching the established pattern from `forgotPassword`), and responds
   `{ twoFactorRequired: true, loginToken }` — **no** `access_token` yet.
3. `POST /auth/login/verify-2fa {loginToken, code}`: hashes `loginToken`,
   looks up the `TwoFactorCode` row by `loginTokenHash`. Invalid if: not
   found, `usedAt` set, `expiresAt` passed, or `attempts >= 5` — all four
   cases collapse into one generic error, "Código inválido ou expirado.",
   never distinguished (same anti-enumeration discipline as password
   reset). If the row is valid but the submitted code's hash doesn't
   match, increments `attempts` and throws the same generic error. If it
   matches: marks `usedAt`, issues the real JWT (`{ access_token }`) via
   `jwtService.sign`, exactly as the non-2FA login path does.

**Enabling 2FA (already logged in):**

1. `POST /auth/2fa/enable` (authenticated via existing JWT guard, no
   body): deletes any prior pending enable-confirmation code for that
   user, generates and emails a fresh 6-digit code (no `loginToken` this
   time), responds `{ message: 'Código de confirmação enviado para seu
   e-mail.' }`.
2. `POST /auth/2fa/confirm { code }` (authenticated): looks up the most
   recent unused enable-confirmation code for `req.user.userId`. Same
   invalid/expired/attempts-exhausted → generic error rule as login
   verification. On match: marks the code used, sets
   `user.twoFactorEnabled = true`, responds
   `{ message: '2FA ativado com sucesso.' }`.

**Disabling 2FA:**

`POST /auth/2fa/disable { password }` (authenticated): re-verifies the
user's current password via `bcrypt.compare` (same convention as login) —
wrong password throws `UnauthorizedException('Senha incorreta.')` (an
explicit, non-generic message is fine here, since this route already
requires a valid JWT — there's no enumeration surface to protect, unlike
the pre-auth password-reset/login-2FA flows). On success: sets
`user.twoFactorEnabled = false`, fire-and-forget emails a plain-text
security notice ("A autenticação de dois fatores da sua conta TagReativa
foi desativada. Se você não fez essa alteração, entre em contato
imediatamente.") to the user's address, responds
`{ message: '2FA desativado com sucesso.' }`.

## Error handling & rate limiting

- `login/verify-2fa` and `2fa/confirm` get `@Throttle({ default: { ttl:
  60000, limit: 5 } })` — **`@Throttle` alone, no redundant
  `@UseGuards(ThrottlerGuard)`**, since `ThrottlerGuard` is already
  registered globally via `APP_GUARD` in `app.module.ts`; adding the
  route-level guard again was exactly the bug found and fixed in the
  password-recovery final review (it silently halves the effective
  limit). This is a hard requirement for this spec, not a suggestion.
- The 5-attempt lockout on `TwoFactorCode.attempts` is defense-in-depth
  alongside the rate limit: even a very fast attacker gets at most 5
  guesses per issued code before it self-invalidates, against a
  900,000-value space (`randomInt(100000, 1000000)` yields 100000-999999
  inclusive), well within the 5-minute expiry window.
  **Correction (post-implementation, final review):** the check-and-increment
  on `attempts` must be atomic (increment first, gate on the returned
  value) — a non-atomic read-then-increment lets concurrent requests
  against the same code all read the same `attempts` count and all get a
  guess, weakening this guarantee under a distributed/parallel attack.
  Fixed in the implementation; noted here so this isn't lost if the spec
  is ever replayed.
- All email sends (login code, enable-confirmation code, disable
  notice) are fire-and-forget with `.then()` (log delivery failure) and
  `.catch()` (log unexpected rejection) — never awaited inline, matching
  the timing-side-channel fix already applied to `forgotPassword`. None
  of these three sends are on an enumeration-sensitive path the way
  `forgotPassword` is (all three already know a valid user exists — via
  successful password check, an active JWT, or an active JWT
  respectively), so there's no equivalent "user exists vs. not" timing
  concern here; fire-and-forget is used for consistency and to avoid
  making the user wait on an SMTP round-trip, not to close a leak.

## Frontend

**`Login.jsx`:** after a successful `POST /auth/login`, if the response
has `twoFactorRequired: true`, the page switches to a second inline view
(same component, local state) showing a 6-digit code input instead of
navigating away; the `loginToken` from the response is held in state and
sent along with the code to `POST /auth/login/verify-2fa`. On success,
`access_token` is stored and the existing `navigate('/dashboard')` runs
exactly as the non-2FA path already does. On a wrong/expired code, shows
the generic error message inline and lets the user retry (bounded by the
5-attempt server-side lockout).

**`Profile.jsx`:** a new section shows current 2FA status (fetched via
the now-extended `GET /users/me` response). If disabled: an "Ativar 2FA"
button calls `POST /auth/2fa/enable`, then reveals a code-input field;
submitting calls `POST /auth/2fa/confirm` and updates the displayed
status on success. If enabled: a "Desativar 2FA" button prompts for the
current password (inline field, not a separate page) and calls
`POST /auth/2fa/disable`.

## Testing

Extends `src/auth/auth.service.spec.ts` (existing file from password
recovery) with new `describe` blocks, mocking `PrismaService`,
`EmailService`, `JwtService` as already established in that file:

1. `login` with `twoFactorEnabled: false` — unchanged behavior, returns
   `access_token` directly (regression guard for the existing path).
2. `login` with `twoFactorEnabled: true` and correct password — returns
   `{ twoFactorRequired: true, loginToken }`, no `access_token`; a
   `TwoFactorCode` row is created with a `loginTokenHash` and the email is
   sent.
3. `login` with `twoFactorEnabled: true` and wrong password — still
   throws `UnauthorizedException` before any 2FA code is issued (password
   check happens first, unchanged).
4. `verifyTwoFactorLogin` with a valid, unexpired, unused code — returns
   `access_token`, marks the row used.
5. `verifyTwoFactorLogin` with a wrong code — generic error, `attempts`
   incremented, no token issued.
6. `verifyTwoFactorLogin` with an expired code — generic error.
7. `verifyTwoFactorLogin` with `attempts >= 5` — generic error even with
   the right code (lockout enforced).
8. `enableTwoFactor` — issues a code with `loginTokenHash: null`, emails
   it, does not yet flip `twoFactorEnabled`.
9. `confirmTwoFactor` with a valid code — flips `user.twoFactorEnabled`
   to `true`.
10. `confirmTwoFactor` with a wrong/expired code — generic error, flag
    unchanged.
11. `disableTwoFactor` with correct password — flips `twoFactorEnabled`
    to `false`, sends the notice email.
12. `disableTwoFactor` with wrong password — throws `UnauthorizedException`,
    flag unchanged.

## Affected files

- `prisma/schema.prisma` (+ new migration): `TwoFactorCode` model,
  `User.twoFactorEnabled` + `User.twoFactorCodes`.
- `src/auth/auth.service.ts`: modify `login`; add
  `verifyTwoFactorLogin`, `enableTwoFactor`, `confirmTwoFactor`,
  `disableTwoFactor`, and the shared code-issuance helper.
- `src/auth/auth.service.spec.ts`: append the 12 cases above.
- `src/auth/auth.controller.ts`: add the four new routes.
- `src/auth/dto/verify-two-factor.dto.ts` (new): `{ loginToken, code }`.
- `src/auth/dto/confirm-two-factor.dto.ts` (new): `{ code }`.
- `src/auth/dto/disable-two-factor.dto.ts` (new): `{ password }`.
- `src/users/users.service.ts`: add `twoFactorEnabled` to `findMe`'s
  select.
- `frontend/src/pages/Login.jsx`: add the inline second step.
- `frontend/src/pages/Profile.jsx`: add the 2FA status/enable/disable
  section.

## Future work (explicitly deferred, not in this project)

- TOTP/authenticator-app support as an alternative second factor.
- Backup/recovery codes.
- Mandatory 2FA (admin-enforced or for specific account types).
- A "trusted device" / remember-this-browser mechanism to skip 2FA on
  recognized devices.
- Session invalidation when 2FA is enabled. Today, enabling 2FA does not
  revoke already-issued JWTs (7-day expiry, no revocation list) — a token
  stolen before 2FA was turned on stays valid regardless. Inherent to the
  existing stateless-JWT design, correctly out of this spec's scope, but
  worth calling out: "I think my account was compromised, let me turn on
  2FA" is the single most likely reason a user enables this feature, and
  this gap means it doesn't fully cover that case.
