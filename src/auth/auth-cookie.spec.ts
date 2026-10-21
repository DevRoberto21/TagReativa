import { lastValueFrom, of } from 'rxjs';
import type { CallHandler, ExecutionContext } from '@nestjs/common';
import { AUTH_COOKIE, AuthCookieInterceptor } from './auth-cookie';

function run(body: unknown) {
  const res = { cookie: jest.fn() };
  const ctx = {
    switchToHttp: () => ({ getResponse: () => res }),
  } as unknown as ExecutionContext;
  const next: CallHandler = { handle: () => of(body) };
  return {
    res,
    out: lastValueFrom(new AuthCookieInterceptor().intercept(ctx, next)),
  };
}

describe('AuthCookieInterceptor', () => {
  it('moves access_token from the body into an httpOnly cookie', async () => {
    const { res, out } = run({ message: 'ok', access_token: 'jwt' });

    await expect(out).resolves.toEqual({ message: 'ok' });
    expect(res.cookie).toHaveBeenCalledWith(
      AUTH_COOKIE,
      'jwt',
      expect.objectContaining({
        httpOnly: true,
        sameSite: 'strict',
        path: '/',
      }),
    );
  });

  it('leaves bodies without a token untouched', async () => {
    const { res, out } = run({ twoFactorRequired: true, loginToken: 't' });

    await expect(out).resolves.toEqual({
      twoFactorRequired: true,
      loginToken: 't',
    });
    expect(res.cookie).not.toHaveBeenCalled();
  });
});
