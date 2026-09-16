# Password Recovery — Design Spec

Date: 2026-09-16
Status: Approved by user, ready for implementation plan

## Context

TagReativa's auth today is single-step email+password → JWT
(`src/auth/auth.service.ts`), with no way to recover a lost password.
This is sub-project 2 of the roadmap agreed during the email-notifications
brainstorming session (Email → Auth hardening → Photo pipeline), and
within Auth hardening the user chose to split 2FA and password recovery
into separate spec/plan cycles, doing password recovery first since it is
simpler and reuses the `EmailService` built in sub-project 1. Target:
production-usable before end of October 2026 (TCC deadline).

## Scope

In scope:
- Backend: `POST /auth/forgot-password` and `POST /auth/reset-password`
  endpoints, a new `PasswordResetToken` table, reusing `EmailService` to
  send the reset link.
- Frontend: two new pages (request-reset form, set-new-password form) and
  a "Esqueci minha senha" link on the Login page.
- Rate limiting on both new endpoints via the existing `ThrottlerGuard`.

Out of scope (explicitly deferred):
- Two-factor authentication — separate spec, sub-project 2b.
- Invalidating already-issued JWTs on password reset. The JWT scheme is
  stateless with no blacklist today; a reset does not revoke sessions
  already logged in elsewhere. Fixing this would require a
  refresh-token/blacklist redesign — noted as future work, not built now.
- Any change to the login flow itself, or to `CreateUserDto`/registration.

## Architecture

New Prisma model `PasswordResetToken`:

```prisma
model PasswordResetToken {
  id        String    @id @default(uuid())
  userId    String
  user      User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  tokenHash String    @unique
  expiresAt DateTime
  usedAt    DateTime?
  createdAt DateTime  @default(now())
}
```

`User` gains a `passwordResetTokens PasswordResetToken[]` relation.

The raw token sent to the user is 32 random bytes
(`crypto.randomBytes(32).toString('hex')`) — high entropy, so it is hashed
with plain SHA-256 (not bcrypt) before being stored; bcrypt's slow-hash
cost exists to slow-down guessing of *low-entropy* secrets like passwords,
which doesn't apply to a 256-bit random token, and SHA-256 keeps the
token lookup a fast indexed equality query.

Two new endpoints on the existing `AuthController`
(`src/auth/auth.controller.ts`), backed by two new methods on
`AuthService` (`src/auth/auth.service.ts`):

- `POST /auth/forgot-password` — body `{ email }`, always responds with
  the same generic message regardless of whether the email exists.
- `POST /auth/reset-password` — body `{ token, newPassword }`.

Both routes get `@UseGuards(ThrottlerGuard)` + `@Throttle(...)`, mirroring
the existing pattern at `src/scan/scan.controller.ts:12-13` (5 requests /
60s) — this bounds both email-bombing on `forgot-password` and
token-guessing on `reset-password`.

## Data flow

**Request a reset (`forgot-password`):**

1. Look up `User` by email.
2. If found: delete any existing `PasswordResetToken` rows for that user
   (only one pending token at a time), generate a new raw token, hash it,
   insert a new row with `expiresAt = now + 1 hour`, and send an email via
   `EmailService.send(...)` with a link to
   `${FRONTEND_URL}/redefinir-senha?token=<rawToken>`. Subject/body are
   plain text, matching the existing `EmailService` contract — no HTML
   template, consistent with the email-notifications sub-project.
3. If not found: do nothing.
4. Either way, respond `200` with the same generic message: something
   like "Se esse e-mail existir em nossa base, enviamos um link de
   recuperação." This prevents an attacker from using this endpoint to
   enumerate registered emails.

**Complete a reset (`reset-password`):**

1. Hash the incoming raw `token` with SHA-256, look up
   `PasswordResetToken` by `tokenHash`.
2. If not found, `usedAt` is already set, or `expiresAt` has passed: throw
   a generic error (e.g. "Link inválido ou expirado.") — the three
   failure cases are not distinguished in the response, to avoid leaking
   which failure mode occurred.
3. If valid: bcrypt-hash `newPassword` (same `bcrypt.hash(..., 10)` call
   already used in `UsersService.create`), update `User.passwordHash`,
   mark the token's `usedAt`, and delete any other pending
   `PasswordResetToken` rows for that user (defense in depth — normally
   there is only ever one, per the delete-on-request step above, but this
   closes the race if a second request happened concurrently).
4. Respond `200` with a success message. `newPassword` validation reuses
   the same rule as registration: `@IsString()` + `@MinLength(6)`
   (`src/users/dto/create-user.dto.ts:15-16`).

## Frontend

Two new pages under `frontend/src/pages/`, following the existing
`Login.jsx` visual pattern (glassmorphism card, green palette, same
`PageContainer` wrapper, same `api` axios client from
`frontend/src/services/api.js`):

- `ForgotPassword.jsx` — single email field, submits to
  `POST /auth/forgot-password`, always shows the generic success message
  on submit (no client-side distinction between "email exists" and
  "doesn't" — the backend already collapses this).
- `ResetPassword.jsx` — reads `token` from the URL query string
  (`useSearchParams`), a new-password field (+ confirm-password field for
  client-side match checking only), submits to
  `POST /auth/reset-password`, redirects to `/login` on success with a
  success message; shows the generic error message on failure.

Routing (`frontend/src/App.jsx`): add
`<Route path="/esqueci-senha" element={<ForgotPassword />} />` and
`<Route path="/redefinir-senha" element={<ResetPassword />} />`, both
public (no `PrivateRoute` wrapper, matching `/login`/`/register`).

`Login.jsx` gains a second `<Link>` below the existing "Criar Conta" link,
pointing to `/esqueci-senha`.

## Error handling

- `forgot-password`: never reveals whether the email exists — same `200`
  and same message on every call, whether the user is found or not, and
  regardless of whether the email actually sends successfully (mirrors
  the "best-effort, log and continue" pattern already established for
  `EmailService`/`CallMeBotService` — an email delivery failure here is
  logged via `console.error`, not surfaced to the caller, since surfacing
  it would itself leak whether the email existed).
- `reset-password`: one generic error message covers "token not found",
  "token already used", and "token expired" — never distinguished in the
  response body, to avoid giving an attacker a signal about which case
  they hit.

## Testing

New `src/auth/auth.service.spec.ts` (does not exist today), mocking
`PrismaService` and `EmailService`, covering:

1. `forgotPassword` with an existing email — creates a token row, calls
   `EmailService.send` with the right recipient, deletes any prior
   pending token for that user first.
2. `forgotPassword` with a non-existent email — no token row created, no
   email sent, still returns the generic success response.
3. `resetPassword` with a valid, unexpired, unused token — updates
   `passwordHash`, marks the token used, deletes other pending tokens for
   that user.
4. `resetPassword` with an unknown token — generic error, no user
   mutation.
5. `resetPassword` with an expired token — generic error, no user
   mutation.
6. `resetPassword` with an already-used token — generic error, no user
   mutation.

## Affected files

- `prisma/schema.prisma` (+ new migration): `PasswordResetToken` model,
  `User.passwordResetTokens` relation.
- `src/auth/auth.service.ts`: add `forgotPassword`, `resetPassword`.
- `src/auth/auth.service.spec.ts` (new).
- `src/auth/auth.controller.ts`: add the two new routes.
- `src/auth/dto/forgot-password.dto.ts` (new): `{ email }`.
- `src/auth/dto/reset-password.dto.ts` (new): `{ token, newPassword }`.
- `frontend/src/pages/ForgotPassword.jsx` (new).
- `frontend/src/pages/ResetPassword.jsx` (new).
- `frontend/src/pages/Login.jsx`: add the "Esqueci minha senha" link.
- `frontend/src/App.jsx`: add the two new routes.

## Future work (explicitly deferred, not in this project)

- Two-factor authentication (separate spec).
- JWT session invalidation on password reset (requires a
  refresh-token/blacklist redesign).
- HTML-templated reset email (current email-notifications sub-project
  already deferred this same item for the "pet found" email; the reset
  email follows the same plain-text convention for consistency).
