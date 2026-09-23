import { applyDecorators } from '@nestjs/common';
import { IsString, Matches } from 'class-validator';

// At least 8 characters, with at least one letter and one number. Only
// enforced when a password is set, so existing accounts keep working.
export const PASSWORD_POLICY_MESSAGE =
  'A senha deve ter pelo menos 8 caracteres, com pelo menos uma letra e um número.';

export function IsPasswordPolicy() {
  return applyDecorators(
    IsString(),
    Matches(/^(?=.*[A-Za-z])(?=.*\d).{8,}$/, {
      message: PASSWORD_POLICY_MESSAGE,
    }),
  );
}
