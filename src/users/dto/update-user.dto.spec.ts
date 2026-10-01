import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { UpdateUserDto } from './update-user.dto';

describe('UpdateUserDto', () => {
  it('requires a non-empty password', async () => {
    for (const body of [
      { name: 'Roberto' },
      { name: 'Roberto', password: '' },
    ]) {
      const errors = await validate(plainToInstance(UpdateUserDto, body));
      expect(errors.map((e) => e.property)).toEqual(['password']);
    }
  });

  it('accepts profile fields with a password', async () => {
    const dto = plainToInstance(UpdateUserDto, {
      name: 'Roberto',
      password: 'senha123',
    });
    expect(await validate(dto)).toHaveLength(0);
  });
});
