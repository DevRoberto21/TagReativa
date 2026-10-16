import { applyDecorators } from '@nestjs/common';
import { IsByteLength, IsString, Matches } from 'class-validator';

// At least 8 characters, with at least one letter and one number. Only
// enforced when a password is set, so existing accounts keep working.
// The 72-byte cap is bcrypt's limit: anything past it would be ignored.
export const PASSWORD_POLICY_MESSAGE =
  'A senha deve ter de 8 a 72 caracteres, com pelo menos uma letra e um número. Acentos e emojis contam como mais de um caractere.';

export function IsPasswordPolicy() {
  return applyDecorators(
    IsString(),
    Matches(/^(?=.*[A-Za-z])(?=.*\d).{8,}$/, {
      message: PASSWORD_POLICY_MESSAGE,
    }),
    IsByteLength(0, 72, { message: PASSWORD_POLICY_MESSAGE }),
  );
}
