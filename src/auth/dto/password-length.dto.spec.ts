import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { DisableTwoFactorDto } from './disable-two-factor.dto';
import { LoginDto } from './login.dto';

describe('password length cap on login-style DTOs', () => {
  it('LoginDto rejects a password longer than 72 characters', async () => {
    const errors = await validate(
      plainToInstance(LoginDto, { email: 'a@b.com', password: 'x'.repeat(73) }),
    );
    expect(errors.map((e) => e.property)).toEqual(['password']);
  });

  it('LoginDto accepts a 72-character password without applying the policy', async () => {
    const errors = await validate(
      plainToInstance(LoginDto, { email: 'a@b.com', password: 'x'.repeat(72) }),
    );
    expect(errors).toHaveLength(0);
  });

  it('DisableTwoFactorDto rejects a password longer than 72 characters', async () => {
    const errors = await validate(
      plainToInstance(DisableTwoFactorDto, { password: 'x'.repeat(73) }),
    );
    expect(errors.map((e) => e.property)).toEqual(['password']);
  });
});
