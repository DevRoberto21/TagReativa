// Mirrors the backend rule in src/auth/password-policy.ts.
export const PASSWORD_POLICY_MESSAGE =
    'A senha deve ter de 8 a 72 caracteres, com pelo menos uma letra e um número. Acentos e emojis contam como mais de um caractere.';

export function meetsPasswordPolicy(password) {
    return (
        /^(?=.*[A-Za-z])(?=.*\d).{8,}$/.test(password) &&
        new TextEncoder().encode(password).length <= 72
    );
}
