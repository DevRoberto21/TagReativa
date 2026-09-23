import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateUserDto } from '../users/dto/create-user.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';

async function passwordErrors(dto: object, field: string) {
  const errors = await validate(dto);
  return errors.filter((e) => e.property === field);
}

function registerDto(password: string) {
  return plainToInstance(CreateUserDto, {
    name: 'Ana',
    email: 'ana@example.com',
    password,
    whatsapp: '5581994640291',
    age: 30,
  });
}

function resetDto(newPassword: string) {
  return plainToInstance(ResetPasswordDto, { token: 'abc', newPassword });
}

describe('password policy', () => {
  const rejected = [
    ['shorter than 8 chars', 'abc1234'],
    ['without a number', 'abcdefgh'],
    ['without a letter', '12345678'],
  ];

  it.each(rejected)('register rejects a password %s', async (_, password) => {
    expect(
      await passwordErrors(registerDto(password), 'password'),
    ).toHaveLength(1);
  });

  it.each(rejected)('reset rejects a password %s', async (_, password) => {
    expect(
      await passwordErrors(resetDto(password), 'newPassword'),
    ).toHaveLength(1);
  });

  it('accepts 8+ chars with a letter and a number', async () => {
    expect(
      await passwordErrors(registerDto('senha123'), 'password'),
    ).toHaveLength(0);
    expect(
      await passwordErrors(resetDto('senha123'), 'newPassword'),
    ).toHaveLength(0);
  });

  it('returns a Portuguese message describing the rule', async () => {
    const [error] = await passwordErrors(registerDto('abc'), 'password');
    expect(Object.values(error.constraints ?? {})).toContain(
      'A senha deve ter pelo menos 8 caracteres, com pelo menos uma letra e um número.',
    );
  });
});
