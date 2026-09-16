# Two-Factor Authentication Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a user opt into email-OTP two-factor authentication from their profile; once enabled, login requires a 6-digit emailed code in addition to the password, end to end (backend + frontend).

**Architecture:** A new `TwoFactorCode` table stores a SHA-256 hash of a 6-digit code, with an optional hashed `loginToken` distinguishing a pre-auth login-flow code from a post-auth enable-confirmation code. `AuthService` gains a shared code-issuance helper reused by both flows, plus `verifyTwoFactorLogin`/`enableTwoFactor`/`confirmTwoFactor`/`disableTwoFactor`. All five 2FA-related routes live on `AuthController` (not `UsersController`) to avoid a circular module dependency. Two frontend pages get extended: `Login.jsx` gains an inline second step, `Profile.jsx` gains a 2FA management section.

**Tech Stack:** NestJS, Prisma/PostgreSQL, `@nestjs/throttler`, `@nestjs/passport` (`AuthGuard('jwt')`, already used elsewhere), Node's built-in `crypto`, React/Vite.

**Spec:** `docs/superpowers/specs/2026-09-16-two-factor-auth-design.md`

## Global Constraints

- Email OTP only — no TOTP/authenticator app, no SMS, no backup codes (all explicitly deferred).
- 2FA is opt-in per user (`User.twoFactorEnabled`, default `false`) — never mandatory.
- 6-digit numeric code via `randomInt(100000, 1000000)`, SHA-256-hashed before storage — raw code only ever appears in the outbound email.
- Login-flow codes expire in exactly 5 minutes; a `loginToken` (32 random bytes, hex, SHA-256-hashed for storage) identifies the pending pre-auth login attempt.
- A code is invalid (and triggers ONE generic error, `'Código inválido ou expirado.'`, never distinguishing why) once: not found, already used, expired, or `attempts >= 5`. A wrong-code submission increments `attempts`.
- `login/verify-2fa` and `2fa/confirm` get `@Throttle({ default: { ttl: 60000, limit: 5 } })` — **`@Throttle` alone, never `@UseGuards(ThrottlerGuard)` too** (`ThrottlerGuard` is already global via `APP_GUARD` in `app.module.ts`; adding it per-route silently halves the effective limit — this exact bug was found and fixed in the password-recovery final review, do not reintroduce it).
- Disabling 2FA requires re-entering the current password (`bcrypt.compare`, same convention as login) — wrong password throws `UnauthorizedException('Senha incorreta.')` (an explicit message is fine here since the route is already JWT-authenticated, no enumeration surface).
- All 2FA-related emails (login code, enable-confirmation code, disable notice) are fire-and-forget: `void this.emailService.send(...).then(...).catch(...)`, matching `forgotPassword`'s established pattern — never `await`ed inline.
- All five new/modified routes live on `AuthController`, not `UsersController`.

---

## File Structure

- `prisma/schema.prisma` — modify: `User.twoFactorEnabled` + `User.twoFactorCodes` relation; new `TwoFactorCode` model.
- `src/auth/auth.service.ts` — modify: add a private `issueTwoFactorCode` helper; modify `login`; add `verifyTwoFactorLogin`, `enableTwoFactor`, `confirmTwoFactor`, `disableTwoFactor`.
- `src/auth/auth.service.spec.ts` — modify: extend shared mocks, add `describe('login', ...)`, `describe('verifyTwoFactorLogin', ...)`, `describe('enableTwoFactor', ...)`, `describe('confirmTwoFactor', ...)`, `describe('disableTwoFactor', ...)`.
- `src/auth/auth.controller.ts` — modify: add `login/verify-2fa`, `2fa/enable`, `2fa/confirm`, `2fa/disable` routes.
- `src/auth/dto/verify-two-factor.dto.ts` — new: `{ loginToken, code }`.
- `src/auth/dto/confirm-two-factor.dto.ts` — new: `{ code }`.
- `src/auth/dto/disable-two-factor.dto.ts` — new: `{ password }`.
- `src/users/users.service.ts` — modify: `findMe`'s `select` gains `twoFactorEnabled`.
- `frontend/src/pages/Login.jsx` — modify: inline second step for the 2FA code.
- `frontend/src/pages/Profile.jsx` — modify: 2FA status/enable/disable section.

---

### Task 1: Schema — TwoFactorCode

**Files:**
- Modify: `prisma/schema.prisma:26-36` (`User` model), append new model after `PasswordResetToken` (currently ends at line 87)

**Interfaces:**
- Produces: `prisma.twoFactorCode` Prisma delegate with `{ id, userId, loginTokenHash, codeHash, expiresAt, attempts, usedAt, createdAt }`, `user.twoFactorCodes` relation, `user.twoFactorEnabled: boolean`. Later tasks use `this.prisma.twoFactorCode.create/findUnique/findFirst/update/deleteMany`.

- [ ] **Step 1: Edit the schema**

In `prisma/schema.prisma`, change the `User` model from:

```prisma
model User {
  id                  String                @id @default(uuid())
  name                String
  email               String                @unique
  passwordHash        String
  whatsapp            String                @unique
  callMeBotApiKey     String?
  age                 Int?
  pets                Pet[]
  passwordResetTokens PasswordResetToken[]
}
```

to:

```prisma
model User {
  id                  String                @id @default(uuid())
  name                String
  email               String                @unique
  passwordHash        String
  whatsapp            String                @unique
  callMeBotApiKey     String?
  age                 Int?
  twoFactorEnabled    Boolean               @default(false)
  pets                Pet[]
  passwordResetTokens PasswordResetToken[]
  twoFactorCodes      TwoFactorCode[]
}
```

Then append this new model at the end of the file (after the `PasswordResetToken` model):

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

- [ ] **Step 2: Generate and apply the migration**

Run: `npx prisma migrate dev --name two_factor_code`

Expected: prompt-free success output ending in `Your database is now in sync with your schema.` and a new folder under `prisma/migrations/` with a `migration.sql` that adds the `twoFactorEnabled` column to `User` and creates the `TwoFactorCode` table with a unique index on `loginTokenHash`.

If this fails with a database connection error, check whether something other than the project's own `tagreativa-db-1` Docker container is listening on port 5432 (`lsof -nP -iTCP:5432 -sTCP:LISTEN`) — a native/Homebrew PostgreSQL service has repeatedly auto-restarted and stolen this port during prior work on this project. If so, stop it (e.g. `brew services stop postgresql@15`) and ensure `docker start tagreativa-db-1` is running, then retry. Report as BLOCKED with the exact error if this doesn't resolve it.

- [ ] **Step 3: Verify the generated Prisma client**

Run: `grep -n "twoFactorEnabled\|TwoFactorCode" node_modules/.prisma/client/index.d.ts | head -10`

Expected: multiple matches. If empty, run `npx prisma generate` and check again.

- [ ] **Step 4: Commit**

```bash
git add prisma/schema.prisma prisma/migrations
git commit -m "feat: add TwoFactorCode model and User.twoFactorEnabled"
```

---

### Task 2: Backend — login flow (issue + verify)

**Files:**
- Create: `src/auth/dto/verify-two-factor.dto.ts`
- Modify: `src/auth/auth.service.ts:1-34` (imports, constants, `login`; append `issueTwoFactorCode` helper and `verifyTwoFactorLogin`)
- Modify: `src/auth/auth.service.spec.ts` (extend shared mocks; add `describe('login', ...)` and `describe('verifyTwoFactorLogin', ...)`)
- Modify: `src/auth/auth.controller.ts:1-16`

**Interfaces:**
- Consumes: `EmailService.send(to, subject, message): Promise<boolean>` (existing). `UsersService.findByEmail(email): Promise<User | null>` (existing).
- Produces: `AuthService.login(dto: LoginDto): Promise<{ access_token: string } | { twoFactorRequired: true; loginToken: string }>` — return type now a union; `AuthService.verifyTwoFactorLogin(dto: VerifyTwoFactorDto): Promise<{ access_token: string }>`. Task 3 reuses the private `issueTwoFactorCode(userId, email, forLogin)` helper this task creates — its exact signature: `private async issueTwoFactorCode(userId: string, email: string, forLogin: boolean): Promise<string | null>` (returns the raw `loginToken` when `forLogin` is `true`, `null` when `false`).

- [ ] **Step 1: Create the DTO**

Create `src/auth/dto/verify-two-factor.dto.ts`:

```typescript
import { IsString, Length, Matches } from 'class-validator';

export class VerifyTwoFactorDto {
  @IsString()
  loginToken!: string;

  @IsString()
  @Length(6, 6)
  @Matches(/^\d{6}$/, { message: 'code deve conter exatamente 6 dígitos numéricos' })
  code!: string;
}
```

- [ ] **Step 2: Write the failing tests**

Read the CURRENT content of `src/auth/auth.service.spec.ts` first (it already has `describe('forgotPassword', ...)` and `describe('resetPassword', ...)` blocks from a prior branch). You are modifying its shared setup and adding two new `describe` blocks — do not remove or alter the existing `forgotPassword`/`resetPassword` tests.

Replace the file's `existingUser` fixture and the `prisma`/`usersService` typed mock declarations — change this:

```typescript
  let usersService: { findByEmail: jest.Mock };
  let prisma: {
    passwordResetToken: {
      deleteMany: jest.Mock;
      create: jest.Mock;
      findUnique: jest.Mock;
      update: jest.Mock;
    };
    user: { update: jest.Mock };
  };
  let emailService: { send: jest.Mock };

  const existingUser = {
    id: 'user-1',
    name: 'Roberto',
    email: 'owner@example.com',
    passwordHash: 'hash',
    whatsapp: '5511999999999',
  };

  beforeEach(async () => {
    usersService = { findByEmail: jest.fn() };
    prisma = {
      passwordResetToken: {
        deleteMany: jest.fn(),
        create: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      user: { update: jest.fn() },
    };
    emailService = { send: jest.fn() };
```

to:

```typescript
  let usersService: { findByEmail: jest.Mock };
  let prisma: {
    passwordResetToken: {
      deleteMany: jest.Mock;
      create: jest.Mock;
      findUnique: jest.Mock;
      update: jest.Mock;
    };
    twoFactorCode: {
      deleteMany: jest.Mock;
      create: jest.Mock;
      findUnique: jest.Mock;
      findFirst: jest.Mock;
      update: jest.Mock;
    };
    user: { update: jest.Mock; findUnique: jest.Mock };
  };
  let emailService: { send: jest.Mock };
  let jwtService: { sign: jest.Mock };

  const existingUser = {
    id: 'user-1',
    name: 'Roberto',
    email: 'owner@example.com',
    passwordHash: 'hash',
    whatsapp: '5511999999999',
    twoFactorEnabled: false,
  };

  const twoFactorUser = {
    ...existingUser,
    id: 'user-2',
    email: 'twofactor@example.com',
    twoFactorEnabled: true,
  };

  beforeEach(async () => {
    usersService = { findByEmail: jest.fn() };
    prisma = {
      passwordResetToken: {
        deleteMany: jest.fn(),
        create: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      twoFactorCode: {
        deleteMany: jest.fn(),
        create: jest.fn(),
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        update: jest.fn(),
      },
      user: { update: jest.fn(), findUnique: jest.fn() },
    };
    emailService = { send: jest.fn() };
    jwtService = { sign: jest.fn().mockReturnValue('signed-jwt') };
```

And change the `TestingModule` provider for `JwtService` from `{ provide: JwtService, useValue: { sign: jest.fn() } }` to `{ provide: JwtService, useValue: jwtService }` (so tests can assert on `jwtService.sign` calls) — keep every other provider line unchanged.

Note real bcrypt (not mocked) is used by these tests via `bcrypt.compare` — the existing file doesn't mock `bcrypt` at all, so don't introduce a mock; instead set `existingUser.passwordHash` to a real bcrypt hash where a test needs `bcrypt.compare` to succeed. Add this near the top of the file, after the imports:

```typescript
import * as bcrypt from 'bcrypt';
```

Then add two new `describe` blocks as siblings to the existing `describe('forgotPassword', ...)` and `describe('resetPassword', ...)` blocks (insert them anywhere between the outer `describe('AuthService', ...)`'s opening and its final closing `});`):

```typescript
  describe('login', () => {
    it('returns an access token directly when 2FA is disabled', async () => {
      const passwordHash = await bcrypt.hash('correct-password', 10);
      usersService.findByEmail.mockResolvedValue({
        ...existingUser,
        passwordHash,
      });

      const result = await service.login({
        email: 'owner@example.com',
        password: 'correct-password',
      });

      expect(result).toEqual({ access_token: 'signed-jwt' });
      expect(prisma.twoFactorCode.create).not.toHaveBeenCalled();
      expect(emailService.send).not.toHaveBeenCalled();
    });

    it('issues a 2FA code and withholds the access token when 2FA is enabled', async () => {
      const passwordHash = await bcrypt.hash('correct-password', 10);
      usersService.findByEmail.mockResolvedValue({
        ...twoFactorUser,
        passwordHash,
      });
      prisma.twoFactorCode.deleteMany.mockResolvedValue({ count: 0 });
      prisma.twoFactorCode.create.mockResolvedValue({});
      emailService.send.mockResolvedValue(true);

      const result = await service.login({
        email: 'twofactor@example.com',
        password: 'correct-password',
      });

      expect(result).toEqual({
        twoFactorRequired: true,
        loginToken: expect.any(String),
      });
      expect((result as { loginToken: string }).loginToken).toHaveLength(64);

      expect(prisma.twoFactorCode.deleteMany).toHaveBeenCalledWith({
        where: { userId: 'user-2', loginTokenHash: { not: null } },
      });
      expect(prisma.twoFactorCode.create).toHaveBeenCalledTimes(1);
      const createArgs = prisma.twoFactorCode.create.mock.calls[0][0];
      expect(createArgs.data.userId).toBe('user-2');
      expect(typeof createArgs.data.loginTokenHash).toBe('string');
      expect(createArgs.data.loginTokenHash).toHaveLength(64);
      expect(typeof createArgs.data.codeHash).toBe('string');
      expect(createArgs.data.codeHash).toHaveLength(64);

      expect(emailService.send).toHaveBeenCalledTimes(1);
      const [to, subject, message] = emailService.send.mock.calls[0];
      expect(to).toBe('twofactor@example.com');
      expect(subject).toMatch(/verificação/i);
      expect(message).toMatch(/\d{6}/);
    });

    it('rejects an incorrect password without issuing a 2FA code, even when 2FA is enabled', async () => {
      const passwordHash = await bcrypt.hash('correct-password', 10);
      usersService.findByEmail.mockResolvedValue({
        ...twoFactorUser,
        passwordHash,
      });

      await expect(
        service.login({ email: 'twofactor@example.com', password: 'wrong' }),
      ).rejects.toThrow('Credenciais inválidas.');
      expect(prisma.twoFactorCode.create).not.toHaveBeenCalled();
      expect(emailService.send).not.toHaveBeenCalled();
    });
  });

  describe('verifyTwoFactorLogin', () => {
    const pendingCode = {
      id: 'tfc-1',
      userId: 'user-2',
      loginTokenHash: '1'.repeat(64),
      codeHash: '',
      expiresAt: new Date(Date.now() + 5 * 60 * 1000),
      attempts: 0,
      usedAt: null as Date | null,
      createdAt: new Date(),
    };

    it('returns an access token for a valid, unexpired, unused code', async () => {
      const crypto = await import('crypto');
      const rightCode = '123456';
      const codeHash = crypto.createHash('sha256').update(rightCode).digest('hex');
      prisma.twoFactorCode.findUnique.mockResolvedValue({
        ...pendingCode,
        codeHash,
      });
      prisma.twoFactorCode.update.mockResolvedValue({});
      prisma.user.findUnique.mockResolvedValue(twoFactorUser);

      const result = await service.verifyTwoFactorLogin({
        loginToken: 'raw-login-token',
        code: rightCode,
      });

      expect(result).toEqual({ access_token: 'signed-jwt' });
      expect(prisma.twoFactorCode.update).toHaveBeenCalledWith({
        where: { id: 'tfc-1' },
        data: { usedAt: expect.any(Date) },
      });
    });

    it('throws a generic error and increments attempts for a wrong code', async () => {
      const crypto = await import('crypto');
      const codeHash = crypto.createHash('sha256').update('999999').digest('hex');
      prisma.twoFactorCode.findUnique.mockResolvedValue({
        ...pendingCode,
        codeHash,
      });
      prisma.twoFactorCode.update.mockResolvedValue({});

      await expect(
        service.verifyTwoFactorLogin({ loginToken: 'raw', code: '111111' }),
      ).rejects.toThrow('Código inválido ou expirado.');

      expect(prisma.twoFactorCode.update).toHaveBeenCalledWith({
        where: { id: 'tfc-1' },
        data: { attempts: { increment: 1 } },
      });
    });

    it('throws a generic error for an expired code', async () => {
      prisma.twoFactorCode.findUnique.mockResolvedValue({
        ...pendingCode,
        expiresAt: new Date(Date.now() - 1000),
      });

      await expect(
        service.verifyTwoFactorLogin({ loginToken: 'raw', code: '123456' }),
      ).rejects.toThrow('Código inválido ou expirado.');
      expect(prisma.user.findUnique).not.toHaveBeenCalled();
    });

    it('throws a generic error once attempts reach the limit, even with the right code', async () => {
      const crypto = await import('crypto');
      const rightCode = '123456';
      const codeHash = crypto.createHash('sha256').update(rightCode).digest('hex');
      prisma.twoFactorCode.findUnique.mockResolvedValue({
        ...pendingCode,
        codeHash,
        attempts: 5,
      });

      await expect(
        service.verifyTwoFactorLogin({ loginToken: 'raw', code: rightCode }),
      ).rejects.toThrow('Código inválido ou expirado.');
      expect(prisma.user.findUnique).not.toHaveBeenCalled();
    });
  });
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npm test -- auth.service.spec.ts`

Expected: FAIL — `service.verifyTwoFactorLogin is not a function`, and `login`'s existing behavior tests fail because `login` doesn't yet check `twoFactorEnabled`.

- [ ] **Step 4: Implement the helper, modify `login`, add `verifyTwoFactorLogin`**

In `src/auth/auth.service.ts`, change the imports and constants at the top from:

```typescript
import { Injectable, UnauthorizedException, BadRequestException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { randomBytes, createHash } from 'crypto';
import { UsersService } from '../users/users.service';
import { PrismaService } from '../prisma/prisma.service';
import { EmailService } from '../email/email.service';
import * as bcrypt from 'bcrypt';
import { LoginDto } from './dto/login.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';

const RESET_TOKEN_TTL_MS = 60 * 60 * 1000;
const FORGOT_PASSWORD_GENERIC_MESSAGE =
  'Se esse e-mail existir em nossa base, enviamos um link de recuperação.';
```

to:

```typescript
import { Injectable, UnauthorizedException, BadRequestException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { randomBytes, randomInt, createHash } from 'crypto';
import { UsersService } from '../users/users.service';
import { PrismaService } from '../prisma/prisma.service';
import { EmailService } from '../email/email.service';
import * as bcrypt from 'bcrypt';
import { LoginDto } from './dto/login.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { VerifyTwoFactorDto } from './dto/verify-two-factor.dto';

const RESET_TOKEN_TTL_MS = 60 * 60 * 1000;
const FORGOT_PASSWORD_GENERIC_MESSAGE =
  'Se esse e-mail existir em nossa base, enviamos um link de recuperação.';
const TWO_FACTOR_CODE_TTL_MS = 5 * 60 * 1000;
const MAX_TWO_FACTOR_ATTEMPTS = 5;
const TWO_FACTOR_GENERIC_ERROR = 'Código inválido ou expirado.';
```

Replace the `login` method:

```typescript
  async login(dto: LoginDto) {
    const user = await this.usersService.findByEmail(dto.email);
    if (!user) throw new UnauthorizedException('Credenciais inválidas.');

    const valid = await bcrypt.compare(dto.password, user.passwordHash);
    if (!valid) throw new UnauthorizedException('Credenciais inválidas.');

    const payload = { sub: user.id, email: user.email };
    return { access_token: this.jwtService.sign(payload) };
  }
```

with:

```typescript
  async login(
    dto: LoginDto,
  ): Promise<{ access_token: string } | { twoFactorRequired: true; loginToken: string }> {
    const user = await this.usersService.findByEmail(dto.email);
    if (!user) throw new UnauthorizedException('Credenciais inválidas.');

    const valid = await bcrypt.compare(dto.password, user.passwordHash);
    if (!valid) throw new UnauthorizedException('Credenciais inválidas.');

    if (user.twoFactorEnabled) {
      const loginToken = await this.issueTwoFactorCode(user.id, user.email, true);
      return { twoFactorRequired: true, loginToken: loginToken! };
    }

    const payload = { sub: user.id, email: user.email };
    return { access_token: this.jwtService.sign(payload) };
  }
```

Add the private helper and `verifyTwoFactorLogin` as new methods on the class (place them after `login`, before `forgotPassword`):

```typescript
  private async issueTwoFactorCode(
    userId: string,
    email: string,
    forLogin: boolean,
  ): Promise<string | null> {
    await this.prisma.twoFactorCode.deleteMany({
      where: {
        userId,
        loginTokenHash: forLogin ? { not: null } : null,
      },
    });

    const code = randomInt(100000, 1000000).toString();
    const codeHash = createHash('sha256').update(code).digest('hex');
    const expiresAt = new Date(Date.now() + TWO_FACTOR_CODE_TTL_MS);

    let loginToken: string | null = null;
    let loginTokenHash: string | null = null;
    if (forLogin) {
      loginToken = randomBytes(32).toString('hex');
      loginTokenHash = createHash('sha256').update(loginToken).digest('hex');
    }

    await this.prisma.twoFactorCode.create({
      data: { userId, loginTokenHash, codeHash, expiresAt },
    });

    void this.emailService
      .send(
        email,
        'Código de verificação - TagReativa',
        `Seu código de verificação é: ${code}\n\nVálido por 5 minutos. Se você não solicitou isso, ignore este e-mail.`,
      )
      .then((delivered) => {
        if (!delivered) {
          console.error(
            '[AUTH] Falha ao enviar e-mail de código de verificação para',
            email,
          );
        }
      })
      .catch((err: unknown) => {
        console.error(
          '[AUTH] Erro inesperado no envio do e-mail de código de verificação:',
          err,
        );
      });

    return loginToken;
  }

  async verifyTwoFactorLogin(
    dto: VerifyTwoFactorDto,
  ): Promise<{ access_token: string }> {
    const loginTokenHash = createHash('sha256')
      .update(dto.loginToken)
      .digest('hex');

    const record = await this.prisma.twoFactorCode.findUnique({
      where: { loginTokenHash },
    });

    const invalid =
      !record ||
      record.usedAt !== null ||
      record.expiresAt < new Date() ||
      record.attempts >= MAX_TWO_FACTOR_ATTEMPTS;

    if (invalid) {
      throw new BadRequestException(TWO_FACTOR_GENERIC_ERROR);
    }

    const codeHash = createHash('sha256').update(dto.code).digest('hex');
    if (codeHash !== record.codeHash) {
      await this.prisma.twoFactorCode.update({
        where: { id: record.id },
        data: { attempts: { increment: 1 } },
      });
      throw new BadRequestException(TWO_FACTOR_GENERIC_ERROR);
    }

    await this.prisma.twoFactorCode.update({
      where: { id: record.id },
      data: { usedAt: new Date() },
    });

    const user = await this.prisma.user.findUnique({
      where: { id: record.userId },
    });
    if (!user) {
      throw new BadRequestException(TWO_FACTOR_GENERIC_ERROR);
    }

    const payload = { sub: user.id, email: user.email };
    return { access_token: this.jwtService.sign(payload) };
  }
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npm test -- auth.service.spec.ts`

Expected: PASS — all tests in the file green (the pre-existing `forgotPassword`/`resetPassword` tests plus the new `login`/`verifyTwoFactorLogin` tests).

- [ ] **Step 6: Add the controller route**

In `src/auth/auth.controller.ts`, change:

```typescript
import { Controller, Post, Body } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('login')
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }

  @Post('forgot-password')
  @Throttle({ default: { ttl: 60000, limit: 5 } })
  forgotPassword(@Body() dto: ForgotPasswordDto) {
    return this.authService.forgotPassword(dto);
  }

  @Post('reset-password')
  @Throttle({ default: { ttl: 60000, limit: 5 } })
  resetPassword(@Body() dto: ResetPasswordDto) {
    return this.authService.resetPassword(dto);
  }
}
```

to:

```typescript
import { Controller, Post, Body } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { VerifyTwoFactorDto } from './dto/verify-two-factor.dto';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('login')
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }

  @Post('login/verify-2fa')
  @Throttle({ default: { ttl: 60000, limit: 5 } })
  verifyTwoFactorLogin(@Body() dto: VerifyTwoFactorDto) {
    return this.authService.verifyTwoFactorLogin(dto);
  }

  @Post('forgot-password')
  @Throttle({ default: { ttl: 60000, limit: 5 } })
  forgotPassword(@Body() dto: ForgotPasswordDto) {
    return this.authService.forgotPassword(dto);
  }

  @Post('reset-password')
  @Throttle({ default: { ttl: 60000, limit: 5 } })
  resetPassword(@Body() dto: ResetPasswordDto) {
    return this.authService.resetPassword(dto);
  }
}
```

(Task 3 will add the `2fa/enable`, `2fa/confirm`, `2fa/disable` routes to this same file — don't add them now.)

- [ ] **Step 7: Run the full test suite and a build check**

Run: `npm test`

Expected: PASS — all suites green.

Run: `npx tsc --noEmit -p tsconfig.build.json`

Expected: 0 errors.

- [ ] **Step 8: Commit**

```bash
git add src/auth/dto/verify-two-factor.dto.ts src/auth/auth.service.ts src/auth/auth.service.spec.ts src/auth/auth.controller.ts
git commit -m "feat: add 2FA login flow (issue code on login, verify to get JWT)"
```

---

### Task 3: Backend — enable/confirm/disable 2FA

**Files:**
- Create: `src/auth/dto/confirm-two-factor.dto.ts`
- Create: `src/auth/dto/disable-two-factor.dto.ts`
- Modify: `src/auth/auth.service.ts` (append `enableTwoFactor`, `confirmTwoFactor`, `disableTwoFactor`; add one import)
- Modify: `src/auth/auth.service.spec.ts` (append 3 new `describe` blocks)
- Modify: `src/auth/auth.controller.ts` (add 3 authenticated routes)
- Modify: `src/users/users.service.ts:50-63` (`findMe`'s `select`)

**Interfaces:**
- Consumes: the private `issueTwoFactorCode(userId, email, forLogin)` helper from Task 2 (called with `forLogin: false` here). `prisma.twoFactorCode.findFirst` (new usage, mock already scaffolded in Task 2's spec changes).
- Produces: `AuthService.enableTwoFactor(userId: string): Promise<{ message: string }>`, `AuthService.confirmTwoFactor(userId: string, dto: ConfirmTwoFactorDto): Promise<{ message: string }>`, `AuthService.disableTwoFactor(userId: string, dto: DisableTwoFactorDto): Promise<{ message: string }>` — the controller (this task) calls all three with this exact shape.

- [ ] **Step 1: Create the DTOs**

Create `src/auth/dto/confirm-two-factor.dto.ts`:

```typescript
import { IsString, Length, Matches } from 'class-validator';

export class ConfirmTwoFactorDto {
  @IsString()
  @Length(6, 6)
  @Matches(/^\d{6}$/, { message: 'code deve conter exatamente 6 dígitos numéricos' })
  code!: string;
}
```

Create `src/auth/dto/disable-two-factor.dto.ts`:

```typescript
import { IsString } from 'class-validator';

export class DisableTwoFactorDto {
  @IsString()
  password!: string;
}
```

- [ ] **Step 2: Write the failing tests**

Read the CURRENT content of `src/auth/auth.service.spec.ts` (it now has `describe('login', ...)` and `describe('verifyTwoFactorLogin', ...)` from Task 2, alongside the original `forgotPassword`/`resetPassword` blocks). Append these three new `describe` blocks as further siblings, anywhere before the outer `describe('AuthService', ...)`'s final closing `});`:

```typescript
  describe('enableTwoFactor', () => {
    it('issues an enable-confirmation code (no loginToken) and does not flip the flag yet', async () => {
      prisma.user.findUnique.mockResolvedValue(existingUser);
      prisma.twoFactorCode.deleteMany.mockResolvedValue({ count: 0 });
      prisma.twoFactorCode.create.mockResolvedValue({});
      emailService.send.mockResolvedValue(true);

      const result = await service.enableTwoFactor('user-1');

      expect(result).toEqual({
        message: 'Código de confirmação enviado para seu e-mail.',
      });
      expect(prisma.twoFactorCode.deleteMany).toHaveBeenCalledWith({
        where: { userId: 'user-1', loginTokenHash: null },
      });
      const createArgs = prisma.twoFactorCode.create.mock.calls[0][0];
      expect(createArgs.data.loginTokenHash).toBeNull();
      expect(emailService.send).toHaveBeenCalledTimes(1);
    });
  });

  describe('confirmTwoFactor', () => {
    const pendingEnableCode = {
      id: 'tfc-enable-1',
      userId: 'user-1',
      loginTokenHash: null as string | null,
      codeHash: '',
      expiresAt: new Date(Date.now() + 5 * 60 * 1000),
      attempts: 0,
      usedAt: null as Date | null,
      createdAt: new Date(),
    };

    it('flips twoFactorEnabled to true for a valid code', async () => {
      const crypto = await import('crypto');
      const rightCode = '654321';
      const codeHash = crypto.createHash('sha256').update(rightCode).digest('hex');
      prisma.twoFactorCode.findFirst.mockResolvedValue({
        ...pendingEnableCode,
        codeHash,
      });
      prisma.twoFactorCode.update.mockResolvedValue({});
      prisma.user.update.mockResolvedValue({});

      const result = await service.confirmTwoFactor('user-1', {
        code: rightCode,
      });

      expect(result).toEqual({ message: '2FA ativado com sucesso.' });
      expect(prisma.twoFactorCode.findFirst).toHaveBeenCalledWith({
        where: { userId: 'user-1', loginTokenHash: null, usedAt: null },
        orderBy: { createdAt: 'desc' },
      });
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        data: { twoFactorEnabled: true },
      });
    });

    it('throws a generic error and leaves the flag unchanged for a wrong code', async () => {
      const crypto = await import('crypto');
      const codeHash = crypto.createHash('sha256').update('000000').digest('hex');
      prisma.twoFactorCode.findFirst.mockResolvedValue({
        ...pendingEnableCode,
        codeHash,
      });
      prisma.twoFactorCode.update.mockResolvedValue({});

      await expect(
        service.confirmTwoFactor('user-1', { code: '111111' }),
      ).rejects.toThrow('Código inválido ou expirado.');
      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it('throws a generic error for an expired code', async () => {
      prisma.twoFactorCode.findFirst.mockResolvedValue({
        ...pendingEnableCode,
        expiresAt: new Date(Date.now() - 1000),
      });

      await expect(
        service.confirmTwoFactor('user-1', { code: '123456' }),
      ).rejects.toThrow('Código inválido ou expirado.');
      expect(prisma.user.update).not.toHaveBeenCalled();
    });
  });

  describe('disableTwoFactor', () => {
    it('flips twoFactorEnabled to false and notifies by email for the correct password', async () => {
      const passwordHash = await bcrypt.hash('current-password', 10);
      prisma.user.findUnique.mockResolvedValue({
        ...twoFactorUser,
        passwordHash,
      });
      prisma.user.update.mockResolvedValue({});
      emailService.send.mockResolvedValue(true);

      const result = await service.disableTwoFactor('user-2', {
        password: 'current-password',
      });

      expect(result).toEqual({ message: '2FA desativado com sucesso.' });
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'user-2' },
        data: { twoFactorEnabled: false },
      });
      expect(emailService.send).toHaveBeenCalledTimes(1);
      const [to, subject] = emailService.send.mock.calls[0];
      expect(to).toBe('twofactor@example.com');
      expect(subject).toMatch(/desativada/i);
    });

    it('throws for an incorrect password and leaves the flag unchanged', async () => {
      const passwordHash = await bcrypt.hash('current-password', 10);
      prisma.user.findUnique.mockResolvedValue({
        ...twoFactorUser,
        passwordHash,
      });

      await expect(
        service.disableTwoFactor('user-2', { password: 'wrong' }),
      ).rejects.toThrow('Senha incorreta.');
      expect(prisma.user.update).not.toHaveBeenCalled();
      expect(emailService.send).not.toHaveBeenCalled();
    });
  });
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npm test -- auth.service.spec.ts`

Expected: FAIL — `service.enableTwoFactor is not a function` (and similarly for the other two).

- [ ] **Step 4: Implement `enableTwoFactor`, `confirmTwoFactor`, `disableTwoFactor`**

In `src/auth/auth.service.ts`, add `NotFoundException` to the `@nestjs/common` import (change the first import line to `import { Injectable, UnauthorizedException, BadRequestException, NotFoundException } from '@nestjs/common';`), add the import `import { ConfirmTwoFactorDto } from './dto/confirm-two-factor.dto';` and `import { DisableTwoFactorDto } from './dto/disable-two-factor.dto';`, and append these three methods to the `AuthService` class (after `verifyTwoFactorLogin`, before `forgotPassword`):

```typescript
  async enableTwoFactor(userId: string): Promise<{ message: string }> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('Usuário não encontrado.');

    await this.issueTwoFactorCode(userId, user.email, false);

    return { message: 'Código de confirmação enviado para seu e-mail.' };
  }

  async confirmTwoFactor(
    userId: string,
    dto: ConfirmTwoFactorDto,
  ): Promise<{ message: string }> {
    const record = await this.prisma.twoFactorCode.findFirst({
      where: { userId, loginTokenHash: null, usedAt: null },
      orderBy: { createdAt: 'desc' },
    });

    const invalid =
      !record ||
      record.expiresAt < new Date() ||
      record.attempts >= MAX_TWO_FACTOR_ATTEMPTS;

    if (invalid) {
      throw new BadRequestException(TWO_FACTOR_GENERIC_ERROR);
    }

    const codeHash = createHash('sha256').update(dto.code).digest('hex');
    if (codeHash !== record.codeHash) {
      await this.prisma.twoFactorCode.update({
        where: { id: record.id },
        data: { attempts: { increment: 1 } },
      });
      throw new BadRequestException(TWO_FACTOR_GENERIC_ERROR);
    }

    await this.prisma.twoFactorCode.update({
      where: { id: record.id },
      data: { usedAt: new Date() },
    });

    await this.prisma.user.update({
      where: { id: userId },
      data: { twoFactorEnabled: true },
    });

    return { message: '2FA ativado com sucesso.' };
  }

  async disableTwoFactor(
    userId: string,
    dto: DisableTwoFactorDto,
  ): Promise<{ message: string }> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('Usuário não encontrado.');

    const valid = await bcrypt.compare(dto.password, user.passwordHash);
    if (!valid) throw new UnauthorizedException('Senha incorreta.');

    await this.prisma.user.update({
      where: { id: userId },
      data: { twoFactorEnabled: false },
    });

    void this.emailService
      .send(
        user.email,
        'Autenticação de dois fatores desativada - TagReativa',
        'A autenticação de dois fatores da sua conta TagReativa foi desativada. Se você não fez essa alteração, entre em contato imediatamente.',
      )
      .then((delivered) => {
        if (!delivered) {
          console.error(
            '[AUTH] Falha ao enviar e-mail de aviso de desativação de 2FA para',
            user.email,
          );
        }
      })
      .catch((err: unknown) => {
        console.error(
          '[AUTH] Erro inesperado no envio do e-mail de aviso de desativação de 2FA:',
          err,
        );
      });

    return { message: '2FA desativado com sucesso.' };
  }
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npm test -- auth.service.spec.ts`

Expected: PASS — every test in the file green (all of Task 2's tests plus these new ones).

- [ ] **Step 6: Add the controller routes**

In `src/auth/auth.controller.ts`, the current import block (after Task 2) is:

```typescript
import { Controller, Post, Body } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { VerifyTwoFactorDto } from './dto/verify-two-factor.dto';
```

Replace it with:

```typescript
import { Controller, Post, Body, UseGuards, Request } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Throttle } from '@nestjs/throttler';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { VerifyTwoFactorDto } from './dto/verify-two-factor.dto';
import { ConfirmTwoFactorDto } from './dto/confirm-two-factor.dto';
import { DisableTwoFactorDto } from './dto/disable-two-factor.dto';
```

Add this interface right after the imports, before `@Controller('auth')`:

```typescript
interface AuthenticatedRequest {
  user: { userId: string };
}
```

Add these three routes to the `AuthController` class, after the `resetPassword` route:

```typescript
  @Post('2fa/enable')
  @UseGuards(AuthGuard('jwt'))
  enableTwoFactor(@Request() req: AuthenticatedRequest) {
    return this.authService.enableTwoFactor(req.user.userId);
  }

  @Post('2fa/confirm')
  @UseGuards(AuthGuard('jwt'))
  @Throttle({ default: { ttl: 60000, limit: 5 } })
  confirmTwoFactor(
    @Request() req: AuthenticatedRequest,
    @Body() dto: ConfirmTwoFactorDto,
  ) {
    return this.authService.confirmTwoFactor(req.user.userId, dto);
  }

  @Post('2fa/disable')
  @UseGuards(AuthGuard('jwt'))
  disableTwoFactor(
    @Request() req: AuthenticatedRequest,
    @Body() dto: DisableTwoFactorDto,
  ) {
    return this.authService.disableTwoFactor(req.user.userId, dto);
  }
```

Do NOT add `@UseGuards(ThrottlerGuard)` anywhere — `ThrottlerGuard` is already global; only `@Throttle(...)` is needed where a non-default limit applies (only `2fa/confirm` needs one here, matching `login/verify-2fa`'s pattern — `2fa/enable` and `2fa/disable` rely on the global 100/60s default since they're JWT-authenticated, not pre-auth/guessable-code endpoints in the same way).

- [ ] **Step 7: Add `twoFactorEnabled` to `findMe`'s select**

In `src/users/users.service.ts`, change the `findMe` method's `select` object from:

```typescript
      select: {
        id: true,
        name: true,
        email: true,
        whatsapp: true,
        age: true,
      },
```

to:

```typescript
      select: {
        id: true,
        name: true,
        email: true,
        whatsapp: true,
        age: true,
        twoFactorEnabled: true,
      },
```

(This is inside `findMe` specifically — `src/users/users.service.ts:50-63`. Do NOT change the `select` blocks inside `create` or `updateMe`, which don't need this field.)

- [ ] **Step 8: Run the full test suite and a build check**

Run: `npm test`

Expected: PASS — all suites green.

Run: `npx tsc --noEmit -p tsconfig.build.json`

Expected: 0 errors.

- [ ] **Step 9: Commit**

```bash
git add src/auth/dto/confirm-two-factor.dto.ts src/auth/dto/disable-two-factor.dto.ts src/auth/auth.service.ts src/auth/auth.service.spec.ts src/auth/auth.controller.ts src/users/users.service.ts
git commit -m "feat: add 2FA enable/confirm/disable flow"
```

---

### Task 4: Frontend — Login two-step + Profile 2FA section

**Files:**
- Modify: `frontend/src/pages/Login.jsx` (full rewrite of the component body)
- Modify: `frontend/src/pages/Profile.jsx` (add a new section + related state/handlers)

**Interfaces:**
- Consumes: `POST /auth/login` → now `{ access_token }` OR `{ twoFactorRequired: true, loginToken }` (Task 2). `POST /auth/login/verify-2fa { loginToken, code }` → `{ access_token }` or throws (Task 2). `GET /users/me` → now includes `twoFactorEnabled: boolean` (Task 3). `POST /auth/2fa/enable` (no body) → `{ message }` (Task 3). `POST /auth/2fa/confirm { code }` → `{ message }` or throws (Task 3). `POST /auth/2fa/disable { password }` → `{ message }` or throws (Task 3).

- [ ] **Step 1: Rewrite `Login.jsx` with the inline second step**

Replace all of `frontend/src/pages/Login.jsx` with:

```jsx
import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import api from '../services/api';
import PageContainer from '../components/PageContainer';

export default function Login() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loginToken, setLoginToken] = useState('');
  const [code, setCode] = useState('');

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    try {
      const { data } = await api.post('/auth/login', { email, password });
      if (data.twoFactorRequired) {
        setLoginToken(data.loginToken);
        return;
      }
      localStorage.setItem('access_token', data.access_token);
      navigate('/dashboard');
    } catch {
      setError('E-mail ou senha inválidos.');
    }
  }

  async function handleVerifyCode(e) {
    e.preventDefault();
    setError('');
    try {
      const { data } = await api.post('/auth/login/verify-2fa', {
        loginToken,
        code,
      });
      localStorage.setItem('access_token', data.access_token);
      navigate('/dashboard');
    } catch {
      setError('Código inválido ou expirado.');
    }
  }

  return (
    <PageContainer style={styles.container}>
      <svg style={styles.bgSvg} viewBox="0 0 1440 900" preserveAspectRatio="xMidYMid slice">
        <path d="M-100,200 C100,250 150,450 50,600 C-50,750 -200,700 -250,550 Z" fill="url(#leafGrad)" opacity="0.4" filter="blur(40px)" />
        <path d="M1500,100 C1350,150 1200,300 1300,500 C1400,700 1550,650 1600,500 Z" fill="url(#leafGrad)" opacity="0.35" filter="blur(50px)" />
        <g stroke="#94D2BD" strokeWidth="1" opacity="0.5" fill="none">
          <circle cx="200" cy="150" r="3" fill="#94D2BD" />
          <circle cx="280" cy="110" r="4" fill="#94D2BD" />
          <line x1="200" y1="150" x2="280" y2="110" />
          <circle cx="1200" cy="400" r="3" fill="#94D2BD" />
          <circle cx="1280" cy="350" r="3" fill="#94D2BD" />
          <line x1="1200" y1="400" x2="1280" y2="350" />
        </g>
        <defs>
          <linearGradient id="leafGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#40916C" />
            <stop offset="100%" stopColor="#A9D6E5" />
          </linearGradient>
        </defs>
      </svg>

      <div style={styles.contentWrapper}>
        <div style={styles.card}>
          <div style={styles.logo}>
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#2D6A4F" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.48 19 2c0 2-.52 3.5-1.6 9.2A7 7 0 0 1 11 20z" />
              <path d="M19 2c-2.26 4.33-5.27 7.14-8 10" />
            </svg>
            <div>
              <div style={styles.logoTitle}>TagReativa</div>
              <div style={styles.logoSub}>Identificação e Proteção Biofílica</div>
            </div>
          </div>

          {loginToken ? (
            <form onSubmit={handleVerifyCode} style={styles.form}>
              <p style={styles.notice}>Digite o código de 6 dígitos enviado para seu e-mail.</p>
              <input
                style={styles.input}
                type="text"
                inputMode="numeric"
                placeholder="Código de verificação"
                value={code}
                onChange={e => setCode(e.target.value)}
                maxLength={6}
                required
              />
              {error && <p style={styles.error}>{error}</p>}
              <button style={styles.button} type="submit">Confirmar Código</button>
            </form>
          ) : (
            <form onSubmit={handleSubmit} style={styles.form}>
              <input
                style={styles.input}
                type="email"
                placeholder="E-mail corporativo ou pessoal"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
              />
              <input
                style={styles.input}
                type="password"
                placeholder="Senha de acesso"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
              />
              {error && <p style={styles.error}>{error}</p>}
              <button style={styles.button} type="submit">Autenticar Sistema</button>
            </form>
          )}

          {!loginToken && (
            <>
              <Link to="/register" style={styles.link}>Solicitar nova credencial — Criar Conta</Link>
              <Link to="/esqueci-senha" style={styles.link}>Esqueci minha senha</Link>
            </>
          )}
        </div>
      </div>
    </PageContainer>
  );
}

const styles = {
  container: { position: 'relative', overflowX: 'hidden', background: 'linear-gradient(135deg, #F0F4F2 0%, #E2ECE9 50%, #D4E5E0 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif' },
  bgSvg: { position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', pointerEvents: 'none', zIndex: 1 },
  contentWrapper: { position: 'relative', zIndex: 2, padding: '24px 16px', width: '100%', display: 'flex', justifyContent: 'center' },
  card: { background: 'rgba(255, 255, 255, 0.85)', backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)', borderRadius: '24px', padding: '40px 32px', width: '100%', maxWidth: '400px', boxSizing: 'border-box', boxShadow: '0 12px 40px rgba(45, 106, 79, 0.05)', border: '1px solid rgba(255, 255, 255, 0.6)' },
  logo: { display: 'flex', alignItems: 'center', gap: '14px', marginBottom: '36px', justifyContent: 'center' },
  logoTitle: { fontSize: '24px', fontWeight: 800, color: '#1B4332', letterSpacing: '-0.5px' },
  logoSub: { fontSize: '12px', color: '#52796F', fontWeight: 500, marginTop: '2px' },
  form: { display: 'flex', flexDirection: 'column', gap: '14px' },
  input: { padding: '14px 16px', borderRadius: '12px', border: '1px solid #CBDCD0', background: '#FFF', fontSize: '14px', outline: 'none', color: '#1B4332', transition: 'border-color 0.2s' },
  button: { padding: '14px', borderRadius: '12px', background: '#2D6A4F', color: '#FFF', fontWeight: 600, fontSize: '14px', border: 'none', cursor: 'pointer', marginTop: '6px', boxShadow: '0 4px 12px rgba(45, 106, 79, 0.15)' },
  error: { color: '#E63946', fontSize: '13px', textAlign: 'center', margin: '4px 0 0', fontWeight: 500 },
  notice: { color: '#2D6A4F', fontSize: '13px', textAlign: 'center', margin: '0 0 4px', fontWeight: 500 },
  link: { display: 'block', textAlign: 'center', marginTop: '24px', color: '#2D6A4F', fontSize: '13px', fontWeight: 600, textDecoration: 'none' },
};
```

- [ ] **Step 2: Add the 2FA section to `Profile.jsx`**

In `frontend/src/pages/Profile.jsx`, add new state near the existing `useState` declarations — change:

```jsx
  const [name, setName] = useState('');
  const [whatsapp, setWhatsapp] = useState('');
  const [age, setAge] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [deleting, setDeleting] = useState(false);
```

to:

```jsx
  const [name, setName] = useState('');
  const [whatsapp, setWhatsapp] = useState('');
  const [age, setAge] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [twoFactorEnabled, setTwoFactorEnabled] = useState(false);
  const [twoFactorStep, setTwoFactorStep] = useState('idle');
  const [twoFactorCode, setTwoFactorCode] = useState('');
  const [twoFactorPassword, setTwoFactorPassword] = useState('');
  const [twoFactorMessage, setTwoFactorMessage] = useState('');
```

Change the `useEffect` that loads the profile from:

```jsx
  useEffect(() => {
    api.get('/users/me')
      .then(r => {
        setName(r.data.name);
        setWhatsapp(r.data.whatsapp);
        setAge(r.data.age ?? '');
      })
      .catch(() => setError('Erro ao carregar perfil do tutor.'));
  }, []);
```

to:

```jsx
  useEffect(() => {
    api.get('/users/me')
      .then(r => {
        setName(r.data.name);
        setWhatsapp(r.data.whatsapp);
        setAge(r.data.age ?? '');
        setTwoFactorEnabled(r.data.twoFactorEnabled);
      })
      .catch(() => setError('Erro ao carregar perfil do tutor.'));
  }, []);
```

Add these handlers after `handleDeleteAccount`:

```jsx
  async function handleEnableTwoFactor() {
    setTwoFactorMessage('');
    try {
      await api.post('/auth/2fa/enable');
      setTwoFactorStep('confirming');
    } catch {
      setTwoFactorMessage('Erro ao solicitar código de confirmação.');
    }
  }

  async function handleConfirmTwoFactor(e) {
    e.preventDefault();
    setTwoFactorMessage('');
    try {
      await api.post('/auth/2fa/confirm', { code: twoFactorCode });
      setTwoFactorEnabled(true);
      setTwoFactorStep('idle');
      setTwoFactorCode('');
    } catch {
      setTwoFactorMessage('Código inválido ou expirado.');
    }
  }

  async function handleDisableTwoFactor(e) {
    e.preventDefault();
    setTwoFactorMessage('');
    try {
      await api.post('/auth/2fa/disable', { password: twoFactorPassword });
      setTwoFactorEnabled(false);
      setTwoFactorStep('idle');
      setTwoFactorPassword('');
    } catch {
      setTwoFactorMessage('Senha incorreta.');
    }
  }
```

Add a new section in the JSX, inside the `card` div, after the `notifButton` button and before `deleteButton`:

```jsx
          <div style={styles.twoFactorSection}>
            <div style={styles.twoFactorHeader}>
              <span style={styles.label}>Autenticação em Dois Fatores</span>
              <span style={twoFactorEnabled ? styles.badgeOn : styles.badgeOff}>
                {twoFactorEnabled ? 'Ativado' : 'Desativado'}
              </span>
            </div>

            {twoFactorMessage && <p style={styles.error}>{twoFactorMessage}</p>}

            {!twoFactorEnabled && twoFactorStep === 'idle' && (
              <button type="button" onClick={handleEnableTwoFactor} style={styles.notifButton}>
                Ativar 2FA
              </button>
            )}

            {!twoFactorEnabled && twoFactorStep === 'confirming' && (
              <form onSubmit={handleConfirmTwoFactor} style={styles.form}>
                <input
                  style={styles.input}
                  type="text"
                  inputMode="numeric"
                  placeholder="Código de 6 dígitos"
                  value={twoFactorCode}
                  onChange={e => setTwoFactorCode(e.target.value)}
                  maxLength={6}
                  required
                />
                <button style={styles.button} type="submit">Confirmar Ativação</button>
              </form>
            )}

            {twoFactorEnabled && twoFactorStep === 'idle' && (
              <button type="button" onClick={() => setTwoFactorStep('disabling')} style={styles.deleteButton}>
                Desativar 2FA
              </button>
            )}

            {twoFactorEnabled && twoFactorStep === 'disabling' && (
              <form onSubmit={handleDisableTwoFactor} style={styles.form}>
                <input
                  style={styles.input}
                  type="password"
                  placeholder="Senha atual"
                  value={twoFactorPassword}
                  onChange={e => setTwoFactorPassword(e.target.value)}
                  required
                />
                <button style={styles.deleteButton} type="submit">Confirmar Desativação</button>
              </form>
            )}
          </div>
```

Add these two style entries to the `styles` object, alongside the existing ones (e.g. right after `notifButton`):

```jsx
  twoFactorSection: { marginTop: '16px', paddingTop: '16px', borderTop: '1px solid #E2ECE9', display: 'flex', flexDirection: 'column', gap: '10px' },
  twoFactorHeader: { display: 'flex', alignItems: 'center', justifyContent: 'space-between' },
  badgeOn: { fontSize: '11px', fontWeight: 700, color: '#2D6A4F', background: '#EAF7F0', padding: '4px 10px', borderRadius: '999px' },
  badgeOff: { fontSize: '11px', fontWeight: 700, color: '#8A8F8C', background: '#F1F3F2', padding: '4px 10px', borderRadius: '999px' },
```

- [ ] **Step 3: Sanity-check the frontend build**

Run: `cd frontend && npm run build`

Expected: build completes with no errors (this catches JSX syntax mistakes without needing a browser).

- [ ] **Step 4: Manual smoke check**

With the backend running (`npm run start:dev`) and the frontend dev server up (`cd frontend && npm run dev`):

1. Log in as a user with 2FA disabled — confirm it goes straight to `/dashboard`, unchanged from before this branch.
2. In Profile, click "Ativar 2FA" — confirm a real email arrives with a 6-digit code, submit it, confirm the badge flips to "Ativado".
3. Log out, log back in with that user — confirm the login form now shows the code-entry step instead of navigating directly; submit the real code from a new email, confirm it lands on `/dashboard`.
4. In Profile, click "Desativar 2FA", enter the current password, confirm the badge flips back to "Desativado" and a "2FA disabled" notice email arrives.
5. Log out, log back in — confirm it goes straight to `/dashboard` again (2FA off).

Report the actual result of each of these 5 checks in the task report.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/Login.jsx frontend/src/pages/Profile.jsx
git commit -m "feat: add 2FA login step and profile enable/disable UI"
```
