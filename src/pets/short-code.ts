import { randomInt } from 'crypto';

// Crockford base32: no I, L, O or U, and every character is in the QR
// alphanumeric charset.
const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const SHORT_CODE_LENGTH = 8;

export const SHORT_CODE_PATTERN = new RegExp(
  `^[${ALPHABET}]{${SHORT_CODE_LENGTH}}$`,
  'i',
);

export function generateShortCode(): string {
  let code = '';
  for (let i = 0; i < SHORT_CODE_LENGTH; i++) {
    code += ALPHABET[randomInt(ALPHABET.length)];
  }
  return code;
}

// Upper-cased as a whole so the QR is encoded in alphanumeric mode (5.5 bits
// per character instead of 8), which keeps the printed code small. Scheme and
// host are case-insensitive and the frontend route matches /S/ as /s/.
export function buildQrCodeUrl(shortCode: string): string {
  const base = process.env.FRONTEND_URL ?? 'http://localhost:5173';
  return `${base}/s/${shortCode}`.toUpperCase();
}
