import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { ChangePasswordDto } from './change-password.dto';

describe('ChangePasswordDto', () => {
  it('requires the current password', async () => {
    for (const body of [
      { newPassword: 'brand-new2' },
      { currentPassword: '', newPassword: 'brand-new2' },
    ]) {
      const errors = await validate(plainToInstance(ChangePasswordDto, body));
      expect(errors.map((e) => e.property)).toEqual(['currentPassword']);
    }
  });

  it('rejects a new password that breaks the password policy', async () => {
    for (const newPassword of ['short1', 'onlyletters', '12345678']) {
      const errors = await validate(
        plainToInstance(ChangePasswordDto, {
          currentPassword: 'current-pass1',
          newPassword,
        }),
      );
      expect(errors.map((e) => e.property)).toEqual(['newPassword']);
    }
  });

  it('accepts a current password with a policy-compliant new one', async () => {
    const dto = plainToInstance(ChangePasswordDto, {
      currentPassword: 'current-pass1',
      newPassword: 'brand-new2',
    });
    expect(await validate(dto)).toHaveLength(0);
  });
});
