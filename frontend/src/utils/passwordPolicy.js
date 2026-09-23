// Mirrors the backend rule in src/auth/password-policy.ts.
export const PASSWORD_POLICY_MESSAGE =
    'A senha deve ter pelo menos 8 caracteres, com pelo menos uma letra e um número.';

export function meetsPasswordPolicy(password) {
    return /^(?=.*[A-Za-z])(?=.*\d).{8,}$/.test(password);
}
