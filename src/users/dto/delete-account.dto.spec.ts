import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { DeleteAccountDto } from './delete-account.dto';

describe('DeleteAccountDto', () => {
  it('requires a non-empty password', async () => {
    for (const body of [{}, { password: '' }, { password: 123 }]) {
      const errors = await validate(plainToInstance(DeleteAccountDto, body));
      expect(errors.map((e) => e.property)).toEqual(['password']);
    }
  });

  it('accepts a password', async () => {
    const dto = plainToInstance(DeleteAccountDto, { password: 'senha123' });
    expect(await validate(dto)).toHaveLength(0);
  });
});
