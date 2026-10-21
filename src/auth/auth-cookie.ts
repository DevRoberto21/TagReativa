import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import type { CookieOptions, Response } from 'express';
import { map } from 'rxjs';

export const AUTH_COOKIE = 'access_token';

// Matches signOptions.expiresIn in auth.module.ts.
const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

function cookieOptions(): CookieOptions {
  return {
    httpOnly: true,
    // Strict is the CSRF defence: the frontend reaches the API same-origin
    // through /api, so the browser never needs to send it cross-site.
    sameSite: 'strict',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
  };
}

export function clearAuthCookie(res: Response): void {
  res.clearCookie(AUTH_COOKIE, cookieOptions());
}

// Keeps the JWT out of reach of page scripts: any access_token a handler
// returns goes into an httpOnly cookie and is stripped from the body.
@Injectable()
export class AuthCookieInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler) {
    const res = context.switchToHttp().getResponse<Response>();
    return next.handle().pipe(
      map((body: unknown) => {
        if (!body || typeof body !== 'object' || !('access_token' in body)) {
          return body;
        }
        const { access_token, ...rest } = body as { access_token: string };
        res.cookie(AUTH_COOKIE, access_token, {
          ...cookieOptions(),
          maxAge: SEVEN_DAYS_MS,
        });
        return rest;
      }),
    );
  }
}
