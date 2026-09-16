# Password Recovery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a user who forgot their password request a reset link by email and set a new password, end to end (backend + frontend).

**Architecture:** A new `PasswordResetToken` table stores a SHA-256 hash of a random 32-byte token with a 1-hour expiry. `AuthService` gains `forgotPassword`/`resetPassword`, reusing the existing `EmailService` (Brevo) to send the link and the existing `bcrypt` password-hashing convention from `UsersService`. Two new `AuthController` routes are rate-limited the same way `ScanController` already rate-limits its public endpoint. Two new frontend pages complete the user-facing flow, following the existing `Login`/`Register` visual pattern.

**Tech Stack:** NestJS, Prisma/PostgreSQL, `@nestjs/throttler`, Node's built-in `crypto`, React/Vite, `react-router-dom`, `axios`.

**Spec:** `docs/superpowers/specs/2026-09-16-password-recovery-design.md`

## Global Constraints

- `forgot-password` always returns the same generic message, whether or not the email exists — never reveal which case occurred.
- `reset-password` always returns the same generic error for "token not found", "already used", and "expired" — never distinguish them in the response.
- Reset token expiry is exactly 1 hour from creation.
- The raw token is 32 random bytes (`crypto.randomBytes(32).toString('hex')`), stored only as a SHA-256 hash — never store or log the raw token server-side after sending the email.
- `newPassword` validation matches registration: `@IsString()` + `@MinLength(6)` (`src/users/dto/create-user.dto.ts:15-16`).
- Email body is plain text via `EmailService.send(to, subject, message)` — no HTML template.
- Both new endpoints get `@UseGuards(ThrottlerGuard)` + `@Throttle({ default: { ttl: 60000, limit: 5 } })`, mirroring `src/scan/scan.controller.ts:12-13`.
- Requesting a new reset deletes any prior pending token for that user first (at most one live token per user).
- JWT session invalidation on reset is explicitly out of scope — do not attempt it.

---

## File Structure

- `prisma/schema.prisma` — modify: new `PasswordResetToken` model, `User.passwordResetTokens` relation.
- `src/auth/dto/forgot-password.dto.ts` — new: `{ email }`.
- `src/auth/dto/reset-password.dto.ts` — new: `{ token, newPassword }`.
- `src/auth/auth.service.ts` — modify: add `forgotPassword`, `resetPassword`; inject `PrismaService`, `EmailService`.
- `src/auth/auth.service.spec.ts` — new: covers both new methods (login is not covered by this plan — out of scope, no pre-existing test to extend).
- `src/auth/auth.controller.ts` — modify: add the two new routes.
- `src/auth/auth.module.ts` — modify: import `EmailModule`.
- `frontend/src/pages/ForgotPassword.jsx` — new.
- `frontend/src/pages/ResetPassword.jsx` — new.
- `frontend/src/pages/Login.jsx` — modify: add "Esqueci minha senha" link.
- `frontend/src/App.jsx` — modify: add the two new routes.

---

### Task 1: Schema — PasswordResetToken

**Files:**
- Modify: `prisma/schema.prisma:26-35` (`User` model), append new model after `Notification` (currently ends at line 76)

**Interfaces:**
- Produces: `prisma.passwordResetToken` Prisma delegate with `{ id, userId, tokenHash, expiresAt, usedAt, createdAt }`, and `user.passwordResetTokens` relation. Later tasks use `this.prisma.passwordResetToken.create/findUnique/update/deleteMany`.

- [ ] **Step 1: Edit the schema**

In `prisma/schema.prisma`, change the `User` model (lines 26-35) from:

```prisma
model User {
  id              String  @id @default(uuid())
  name            String
  email           String  @unique
  passwordHash    String
  whatsapp        String  @unique
  callMeBotApiKey String?
  age             Int?
  pets            Pet[]
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
  pets                Pet[]
  passwordResetTokens PasswordResetToken[]
}
```

Then append this new model at the end of the file (after the `Notification` model):

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

- [ ] **Step 2: Generate and apply the migration**

Run: `npx prisma migrate dev --name password_reset_token`

Expected: prompt-free success output ending in `Your database is now in sync with your schema.` and a new folder under `prisma/migrations/` containing a `migration.sql` that creates the `PasswordResetToken` table with a unique index on `tokenHash`.

If this fails with a database connection error, check whether something other than the project's own `tagreativa-db-1` Docker container is listening on port 5432 (run `lsof -nP -iTCP:5432 -sTCP:LISTEN`) — a native/Homebrew PostgreSQL service has repeatedly auto-restarted and stolen this port during prior work on this project. If so, stop it (e.g. `brew services stop postgresql@15`) and ensure `docker start tagreativa-db-1` is running, then retry the migration. Report as BLOCKED with the exact error if this doesn't resolve it.

- [ ] **Step 3: Verify the generated Prisma client**

Run: `grep -n "PasswordResetToken" node_modules/.prisma/client/index.d.ts | head -5`

Expected: at least one match. If empty, run `npx prisma generate` and check again.

- [ ] **Step 4: Commit**

```bash
git add prisma/schema.prisma prisma/migrations
git commit -m "feat: add PasswordResetToken model for password recovery"
```

---

### Task 2: Backend — forgot-password

**Files:**
- Create: `src/auth/dto/forgot-password.dto.ts`
- Modify: `src/auth/auth.service.ts:1-24`
- Modify: `src/auth/auth.module.ts:1-24`
- Test: `src/auth/auth.service.spec.ts` (new file — will be extended again in Task 3)

**Interfaces:**
- Consumes: `EmailService.send(to: string, subject: string, message: string): Promise<boolean>` (existing, `src/email/email.service.ts`). `UsersService.findByEmail(email: string)` (existing, `src/users/users.service.ts`). `prisma.passwordResetToken.deleteMany`/`.create` (Task 1).
- Produces: `AuthService.forgotPassword(dto: ForgotPasswordDto): Promise<{ message: string }>` — later tasks and the controller call this exact signature.

- [ ] **Step 1: Create the DTO**

Create `src/auth/dto/forgot-password.dto.ts`:

```typescript
import { IsEmail } from 'class-validator';

export class ForgotPasswordDto {
  @IsEmail()
  email!: string;
}
```

- [ ] **Step 2: Write the failing tests**

Create `src/auth/auth.service.spec.ts`:

```typescript
import { Test, TestingModule } from '@nestjs/testing';
import { AuthService } from './auth.service';
import { UsersService } from '../users/users.service';
import { PrismaService } from '../prisma/prisma.service';
import { EmailService } from '../email/email.service';
import { JwtService } from '@nestjs/jwt';

describe('AuthService', () => {
  let service: AuthService;
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

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: UsersService, useValue: usersService },
        { provide: PrismaService, useValue: prisma },
        { provide: EmailService, useValue: emailService },
        { provide: JwtService, useValue: { sign: jest.fn() } },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
  });

  describe('forgotPassword', () => {
    it('creates a token and sends an email when the address exists', async () => {
      usersService.findByEmail.mockResolvedValue(existingUser);
      prisma.passwordResetToken.deleteMany.mockResolvedValue({ count: 0 });
      prisma.passwordResetToken.create.mockResolvedValue({});
      emailService.send.mockResolvedValue(true);

      const result = await service.forgotPassword({
        email: 'owner@example.com',
      });

      expect(prisma.passwordResetToken.deleteMany).toHaveBeenCalledWith({
        where: { userId: 'user-1' },
      });
      expect(prisma.passwordResetToken.create).toHaveBeenCalledTimes(1);
      const createArgs = prisma.passwordResetToken.create.mock.calls[0][0];
      expect(createArgs.data.userId).toBe('user-1');
      expect(typeof createArgs.data.tokenHash).toBe('string');
      expect(createArgs.data.tokenHash).toHaveLength(64);
      expect(createArgs.data.expiresAt).toBeInstanceOf(Date);

      expect(emailService.send).toHaveBeenCalledTimes(1);
      const [to, subject, message] = emailService.send.mock.calls[0];
      expect(to).toBe('owner@example.com');
      expect(subject).toMatch(/recuperação/i);
      expect(message).toContain('/redefinir-senha?token=');

      expect(result).toEqual({
        message:
          'Se esse e-mail existir em nossa base, enviamos um link de recuperação.',
      });
    });

    it('does nothing but still returns the generic message when the email does not exist', async () => {
      usersService.findByEmail.mockResolvedValue(null);

      const result = await service.forgotPassword({
        email: 'nobody@example.com',
      });

      expect(prisma.passwordResetToken.deleteMany).not.toHaveBeenCalled();
      expect(prisma.passwordResetToken.create).not.toHaveBeenCalled();
      expect(emailService.send).not.toHaveBeenCalled();
      expect(result).toEqual({
        message:
          'Se esse e-mail existir em nossa base, enviamos um link de recuperação.',
      });
    });
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npm test -- auth.service.spec.ts`

Expected: FAIL — `service.forgotPassword is not a function`.

- [ ] **Step 4: Implement `forgotPassword`**

Replace all of `src/auth/auth.service.ts` with:

```typescript
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { randomBytes, createHash } from 'crypto';
import { UsersService } from '../users/users.service';
import { PrismaService } from '../prisma/prisma.service';
import { EmailService } from '../email/email.service';
import * as bcrypt from 'bcrypt';
import { LoginDto } from './dto/login.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';

const RESET_TOKEN_TTL_MS = 60 * 60 * 1000;
const FORGOT_PASSWORD_GENERIC_MESSAGE =
  'Se esse e-mail existir em nossa base, enviamos um link de recuperação.';

@Injectable()
export class AuthService {
  constructor(
    private usersService: UsersService,
    private jwtService: JwtService,
    private prisma: PrismaService,
    private emailService: EmailService,
  ) {}

  async login(dto: LoginDto) {
    const user = await this.usersService.findByEmail(dto.email);
    if (!user) throw new UnauthorizedException('Credenciais inválidas.');

    const valid = await bcrypt.compare(dto.password, user.passwordHash);
    if (!valid) throw new UnauthorizedException('Credenciais inválidas.');

    const payload = { sub: user.id, email: user.email };
    return { access_token: this.jwtService.sign(payload) };
  }

  async forgotPassword(dto: ForgotPasswordDto): Promise<{ message: string }> {
    const user = await this.usersService.findByEmail(dto.email);
    if (!user) return { message: FORGOT_PASSWORD_GENERIC_MESSAGE };

    await this.prisma.passwordResetToken.deleteMany({
      where: { userId: user.id },
    });

    const rawToken = randomBytes(32).toString('hex');
    const tokenHash = createHash('sha256').update(rawToken).digest('hex');
    const expiresAt = new Date(Date.now() + RESET_TOKEN_TTL_MS);

    await this.prisma.passwordResetToken.create({
      data: { userId: user.id, tokenHash, expiresAt },
    });

    const resetUrl = `${process.env.FRONTEND_URL ?? 'http://localhost:5173'}/redefinir-senha?token=${rawToken}`;

    await this.emailService.send(
      user.email,
      'Recuperação de senha - TagReativa',
      `Recebemos um pedido para redefinir a senha da sua conta TagReativa. Acesse o link abaixo para criar uma nova senha (válido por 1 hora):\n\n${resetUrl}\n\nSe você não solicitou isso, ignore este e-mail.`,
    );

    return { message: FORGOT_PASSWORD_GENERIC_MESSAGE };
  }
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npm test -- auth.service.spec.ts`

Expected: PASS — 2 tests passing.

- [ ] **Step 6: Wire `EmailModule` into `AuthModule`**

In `src/auth/auth.module.ts`, change:

```typescript
import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { UsersModule } from '../users/users.module';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { JwtStrategy } from './jwt.strategy';

@Module({
  imports: [
    UsersModule,
    PassportModule,
    JwtModule.registerAsync({
      useFactory: () => {
        const secret = process.env.JWT_SECRET;
        if (!secret) throw new Error('FATAL: JWT_SECRET não definido.');
        return { secret, signOptions: { expiresIn: '7d' } };
      },
    }),
  ],
  providers: [AuthService, JwtStrategy],
  exports: [AuthService],
  controllers: [AuthController],
})
export class AuthModule {}
```

to:

```typescript
import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { UsersModule } from '../users/users.module';
import { EmailModule } from '../email/email.module';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { JwtStrategy } from './jwt.strategy';

@Module({
  imports: [
    UsersModule,
    EmailModule,
    PassportModule,
    JwtModule.registerAsync({
      useFactory: () => {
        const secret = process.env.JWT_SECRET;
        if (!secret) throw new Error('FATAL: JWT_SECRET não definido.');
        return { secret, signOptions: { expiresIn: '7d' } };
      },
    }),
  ],
  providers: [AuthService, JwtStrategy],
  exports: [AuthService],
  controllers: [AuthController],
})
export class AuthModule {}
```

- [ ] **Step 7: Commit**

```bash
git add src/auth/dto/forgot-password.dto.ts src/auth/auth.service.ts src/auth/auth.service.spec.ts src/auth/auth.module.ts
git commit -m "feat: add AuthService.forgotPassword with token issuance and email"
```

---

### Task 3: Backend — reset-password + controller routes

**Files:**
- Create: `src/auth/dto/reset-password.dto.ts`
- Modify: `src/auth/auth.service.ts` (append `resetPassword`)
- Modify: `src/auth/auth.service.spec.ts` (append `resetPassword` describe block)
- Modify: `src/auth/auth.controller.ts:1-13`

**Interfaces:**
- Consumes: `prisma.passwordResetToken.findUnique/update/deleteMany`, `prisma.user.update` (Task 1). `AuthService.forgotPassword` (Task 2, unchanged by this task).
- Produces: `AuthService.resetPassword(dto: ResetPasswordDto): Promise<{ message: string }>` — the controller (this task) calls this exact signature.

- [ ] **Step 1: Create the DTO**

Create `src/auth/dto/reset-password.dto.ts`:

```typescript
import { IsString, MinLength } from 'class-validator';

export class ResetPasswordDto {
  @IsString()
  token!: string;

  @IsString()
  @MinLength(6)
  newPassword!: string;
}
```

- [ ] **Step 2: Write the failing tests**

Append this `describe` block to the end of `src/auth/auth.service.spec.ts`, inside the existing outer `describe('AuthService', ...)` block (add it as a sibling to the `describe('forgotPassword', ...)` block, before the final closing `});`):

```typescript
  describe('resetPassword', () => {
    const validToken = {
      id: 'reset-1',
      userId: 'user-1',
      tokenHash: '0'.repeat(64), // exact value is irrelevant: resetPassword() never reads this field back, it only computes its own hash from the input token to build the findUnique lookup
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      usedAt: null as Date | null,
      createdAt: new Date(),
    };

    it('updates the password and marks the token used for a valid token', async () => {
      prisma.passwordResetToken.findUnique.mockResolvedValue(validToken);
      prisma.user.update.mockResolvedValue({});
      prisma.passwordResetToken.update.mockResolvedValue({});
      prisma.passwordResetToken.deleteMany.mockResolvedValue({ count: 0 });

      const result = await service.resetPassword({
        token: 'raw-token-value',
        newPassword: 'newpass123',
      });

      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        data: { passwordHash: expect.any(String) },
      });
      expect(prisma.passwordResetToken.update).toHaveBeenCalledWith({
        where: { id: 'reset-1' },
        data: { usedAt: expect.any(Date) },
      });
      expect(prisma.passwordResetToken.deleteMany).toHaveBeenCalledWith({
        where: { userId: 'user-1', id: { not: 'reset-1' } },
      });
      expect(result).toEqual({ message: 'Senha redefinida com sucesso.' });
    });

    it('throws a generic error for an unknown token', async () => {
      prisma.passwordResetToken.findUnique.mockResolvedValue(null);

      await expect(
        service.resetPassword({ token: 'bogus', newPassword: 'newpass123' }),
      ).rejects.toThrow('Link inválido ou expirado.');
      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it('throws a generic error for an expired token', async () => {
      prisma.passwordResetToken.findUnique.mockResolvedValue({
        ...validToken,
        expiresAt: new Date(Date.now() - 1000),
      });

      await expect(
        service.resetPassword({ token: 'expired', newPassword: 'newpass123' }),
      ).rejects.toThrow('Link inválido ou expirado.');
      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it('throws a generic error for an already-used token', async () => {
      prisma.passwordResetToken.findUnique.mockResolvedValue({
        ...validToken,
        usedAt: new Date(),
      });

      await expect(
        service.resetPassword({ token: 'used', newPassword: 'newpass123' }),
      ).rejects.toThrow('Link inválido ou expirado.');
      expect(prisma.user.update).not.toHaveBeenCalled();
    });
  });
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npm test -- auth.service.spec.ts`

Expected: FAIL — `service.resetPassword is not a function`.

- [ ] **Step 4: Implement `resetPassword`**

In `src/auth/auth.service.ts`, add `BadRequestException` to the `@nestjs/common` import (change `import { Injectable, UnauthorizedException } from '@nestjs/common';` to `import { Injectable, UnauthorizedException, BadRequestException } from '@nestjs/common';`), and append this method to the `AuthService` class, after `forgotPassword`:

```typescript
  async resetPassword(dto: ResetPasswordDto): Promise<{ message: string }> {
    const tokenHash = createHash('sha256').update(dto.token).digest('hex');

    const resetToken = await this.prisma.passwordResetToken.findUnique({
      where: { tokenHash },
    });

    const invalid =
      !resetToken ||
      resetToken.usedAt !== null ||
      resetToken.expiresAt < new Date();

    if (invalid) {
      throw new BadRequestException('Link inválido ou expirado.');
    }

    const passwordHash = await bcrypt.hash(dto.newPassword, 10);

    await this.prisma.user.update({
      where: { id: resetToken.userId },
      data: { passwordHash },
    });

    await this.prisma.passwordResetToken.update({
      where: { id: resetToken.id },
      data: { usedAt: new Date() },
    });

    await this.prisma.passwordResetToken.deleteMany({
      where: { userId: resetToken.userId, id: { not: resetToken.id } },
    });

    return { message: 'Senha redefinida com sucesso.' };
  }
```

Also add the `ResetPasswordDto` import at the top: `import { ResetPasswordDto } from './dto/reset-password.dto';`

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npm test -- auth.service.spec.ts`

Expected: PASS — 6 tests passing (2 from Task 2 + 4 from this task).

- [ ] **Step 6: Add the controller routes**

Replace all of `src/auth/auth.controller.ts` with:

```typescript
import { Controller, Post, Body, UseGuards } from '@nestjs/common';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
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
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { ttl: 60000, limit: 5 } })
  forgotPassword(@Body() dto: ForgotPasswordDto) {
    return this.authService.forgotPassword(dto);
  }

  @Post('reset-password')
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { ttl: 60000, limit: 5 } })
  resetPassword(@Body() dto: ResetPasswordDto) {
    return this.authService.resetPassword(dto);
  }
}
```

- [ ] **Step 7: Run the full backend test suite and a build check**

Run: `npm test`

Expected: PASS — all suites green (this branch's own additions plus every suite fixed on 2026-09-16, e.g. `scan.controller.spec.ts`, `pets.controller.spec.ts`).

Run: `npx tsc --noEmit -p tsconfig.build.json`

Expected: 0 errors.

- [ ] **Step 8: Commit**

```bash
git add src/auth/dto/reset-password.dto.ts src/auth/auth.service.ts src/auth/auth.service.spec.ts src/auth/auth.controller.ts
git commit -m "feat: add AuthService.resetPassword and auth reset-password/forgot-password routes"
```

---

### Task 4: Frontend — forgot/reset password pages

**Files:**
- Create: `frontend/src/pages/ForgotPassword.jsx`
- Create: `frontend/src/pages/ResetPassword.jsx`
- Modify: `frontend/src/pages/Login.jsx:105` (area around the existing `<Link>` to `/register`)
- Modify: `frontend/src/App.jsx:1-32`

**Interfaces:**
- Consumes: `POST /auth/forgot-password { email }` → `{ message: string }` (Task 2). `POST /auth/reset-password { token, newPassword }` → `{ message: string }` on success, throws on failure (Task 3). The shared `api` axios client from `frontend/src/services/api.js` (existing, already attaches auth header and base URL — not needed for these public routes but consistent with every other page's HTTP calls).

- [ ] **Step 1: Create the "forgot password" page**

Create `frontend/src/pages/ForgotPassword.jsx`:

```jsx
import { useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../services/api';
import PageContainer from '../components/PageContainer';

export default function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setMessage('');
    setSubmitting(true);
    try {
      const { data } = await api.post('/auth/forgot-password', { email });
      setMessage(data.message);
    } catch {
      setError('Não foi possível processar o pedido. Tente novamente.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <PageContainer style={styles.container}>
      <div style={styles.contentWrapper}>
        <div style={styles.card}>
          <div style={styles.logo}>
            <div>
              <div style={styles.logoTitle}>TagReativa</div>
              <div style={styles.logoSub}>Recuperar acesso</div>
            </div>
          </div>

          {message ? (
            <p style={styles.success}>{message}</p>
          ) : (
            <form onSubmit={handleSubmit} style={styles.form}>
              <input
                style={styles.input}
                type="email"
                placeholder="Seu e-mail cadastrado"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
              {error && <p style={styles.error}>{error}</p>}
              <button style={styles.button} type="submit" disabled={submitting}>
                {submitting ? 'Enviando...' : 'Enviar link de recuperação'}
              </button>
            </form>
          )}

          <Link to="/login" style={styles.link}>Voltar para o login</Link>
        </div>
      </div>
    </PageContainer>
  );
}

const styles = {
  container: { position: 'relative', overflowX: 'hidden', background: 'linear-gradient(135deg, #F0F4F2 0%, #E2ECE9 50%, #D4E5E0 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif' },
  contentWrapper: { position: 'relative', zIndex: 2, padding: '24px 16px', width: '100%', display: 'flex', justifyContent: 'center' },
  card: { background: 'rgba(255, 255, 255, 0.85)', backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)', borderRadius: '24px', padding: '40px 32px', width: '100%', maxWidth: '400px', boxSizing: 'border-box', boxShadow: '0 12px 40px rgba(45, 106, 79, 0.05)', border: '1px solid rgba(255, 255, 255, 0.6)' },
  logo: { display: 'flex', alignItems: 'center', gap: '14px', marginBottom: '28px', justifyContent: 'center' },
  logoTitle: { fontSize: '24px', fontWeight: 800, color: '#1B4332', letterSpacing: '-0.5px' },
  logoSub: { fontSize: '12px', color: '#52796F', fontWeight: 500, marginTop: '2px' },
  form: { display: 'flex', flexDirection: 'column', gap: '14px' },
  input: { padding: '14px 16px', borderRadius: '12px', border: '1px solid #CBDCD0', background: '#FFF', fontSize: '14px', outline: 'none', color: '#1B4332', boxSizing: 'border-box' },
  button: { padding: '14px', borderRadius: '12px', background: '#2D6A4F', color: '#FFF', fontWeight: 600, fontSize: '14px', border: 'none', cursor: 'pointer', marginTop: '6px', boxShadow: '0 4px 12px rgba(45, 106, 79, 0.15)' },
  error: { color: '#E63946', fontSize: '13px', textAlign: 'center', margin: '4px 0 0', fontWeight: 500 },
  success: { color: '#2D6A4F', fontSize: '14px', textAlign: 'center', lineHeight: '1.5', margin: '8px 0 24px' },
  link: { display: 'block', textAlign: 'center', marginTop: '24px', color: '#2D6A4F', fontSize: '13px', fontWeight: 600, textDecoration: 'none' },
};
```

- [ ] **Step 2: Create the "reset password" page**

Create `frontend/src/pages/ResetPassword.jsx`:

```jsx
import { useState } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import api from '../services/api';
import PageContainer from '../components/PageContainer';

export default function ResetPassword() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') ?? '';
  const [newPassword, setNewPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    if (newPassword !== confirm) {
      setError('As senhas não coincidem.');
      return;
    }
    setSubmitting(true);
    try {
      await api.post('/auth/reset-password', { token, newPassword });
      navigate('/login');
    } catch {
      setError('Link inválido ou expirado.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <PageContainer style={styles.container}>
      <div style={styles.contentWrapper}>
        <div style={styles.card}>
          <div style={styles.logo}>
            <div>
              <div style={styles.logoTitle}>TagReativa</div>
              <div style={styles.logoSub}>Definir nova senha</div>
            </div>
          </div>

          <form onSubmit={handleSubmit} style={styles.form}>
            <input
              style={styles.input}
              type="password"
              placeholder="Nova senha"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              required
              minLength={6}
            />
            <input
              style={styles.input}
              type="password"
              placeholder="Confirmar nova senha"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              required
              minLength={6}
            />
            {error && <p style={styles.error}>{error}</p>}
            <button style={styles.button} type="submit" disabled={submitting}>
              {submitting ? 'Salvando...' : 'Redefinir senha'}
            </button>
          </form>

          <Link to="/login" style={styles.link}>Voltar para o login</Link>
        </div>
      </div>
    </PageContainer>
  );
}

const styles = {
  container: { position: 'relative', overflowX: 'hidden', background: 'linear-gradient(135deg, #F0F4F2 0%, #E2ECE9 50%, #D4E5E0 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif' },
  contentWrapper: { position: 'relative', zIndex: 2, padding: '24px 16px', width: '100%', display: 'flex', justifyContent: 'center' },
  card: { background: 'rgba(255, 255, 255, 0.85)', backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)', borderRadius: '24px', padding: '40px 32px', width: '100%', maxWidth: '400px', boxSizing: 'border-box', boxShadow: '0 12px 40px rgba(45, 106, 79, 0.05)', border: '1px solid rgba(255, 255, 255, 0.6)' },
  logo: { display: 'flex', alignItems: 'center', gap: '14px', marginBottom: '28px', justifyContent: 'center' },
  logoTitle: { fontSize: '24px', fontWeight: 800, color: '#1B4332', letterSpacing: '-0.5px' },
  logoSub: { fontSize: '12px', color: '#52796F', fontWeight: 500, marginTop: '2px' },
  form: { display: 'flex', flexDirection: 'column', gap: '14px' },
  input: { padding: '14px 16px', borderRadius: '12px', border: '1px solid #CBDCD0', background: '#FFF', fontSize: '14px', outline: 'none', color: '#1B4332', boxSizing: 'border-box' },
  button: { padding: '14px', borderRadius: '12px', background: '#2D6A4F', color: '#FFF', fontWeight: 600, fontSize: '14px', border: 'none', cursor: 'pointer', marginTop: '6px', boxShadow: '0 4px 12px rgba(45, 106, 79, 0.15)' },
  error: { color: '#E63946', fontSize: '13px', textAlign: 'center', margin: '4px 0 0', fontWeight: 500 },
  link: { display: 'block', textAlign: 'center', marginTop: '24px', color: '#2D6A4F', fontSize: '13px', fontWeight: 600, textDecoration: 'none' },
};
```

- [ ] **Step 3: Add the link on the Login page**

In `frontend/src/pages/Login.jsx`, change the single closing link line:

```jsx
          <Link to="/register" style={styles.link}>Solicitar nova credencial — Criar Conta</Link>
```

to:

```jsx
          <Link to="/register" style={styles.link}>Solicitar nova credencial — Criar Conta</Link>
          <Link to="/esqueci-senha" style={styles.link}>Esqueci minha senha</Link>
```

- [ ] **Step 4: Wire the routes**

In `frontend/src/App.jsx`, add two imports after the existing `import Register from './pages/Register';` line:

```jsx
import ForgotPassword from './pages/ForgotPassword';
import ResetPassword from './pages/ResetPassword';
```

Add two new public routes next to the existing `/register` route:

```jsx
        <Route path="/register" element={<Register />} />
        <Route path="/esqueci-senha" element={<ForgotPassword />} />
        <Route path="/redefinir-senha" element={<ResetPassword />} />
```

- [ ] **Step 5: Manual smoke check**

Run: `cd frontend && npm run dev` (or confirm it's already running), then in a browser:

1. Visit `/esqueci-senha`, submit a real registered email, confirm the generic success message appears.
2. Visit `/esqueci-senha`, submit an email that isn't registered, confirm the exact same generic message appears (this is the point — no visible difference).
3. With a real backend running and real Brevo credentials configured (`BREVO_API_KEY`/`BREVO_SENDER_EMAIL` in `.env`), confirm the reset email actually arrives and its link opens `/redefinir-senha?token=...` with a token in the URL.
4. On that page, submit a new password, confirm redirect to `/login`, and confirm the new password actually logs in.
5. Reuse the same link a second time (browser back, resubmit), confirm it now shows "Link inválido ou expirado."

Report the actual result of each of these 5 checks in the task report — this is real end-to-end verification, not optional.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/pages/ForgotPassword.jsx frontend/src/pages/ResetPassword.jsx frontend/src/pages/Login.jsx frontend/src/App.jsx
git commit -m "feat: add forgot/reset password pages and routing"
```
