import * as QRCode from 'qrcode';
import { buildQrCodeUrl, generateShortCode } from './short-code';

describe('short-code', () => {
  const originalFrontendUrl = process.env.FRONTEND_URL;

  afterEach(() => {
    process.env.FRONTEND_URL = originalFrontendUrl;
  });

  it('generates 8-character Crockford base32 codes', () => {
    for (let i = 0; i < 200; i++) {
      expect(generateShortCode()).toMatch(/^[0-9A-HJKMNP-TV-Z]{8}$/);
    }
  });

  it('builds an upper-case URL under /S/', () => {
    process.env.FRONTEND_URL = 'https://tagreativa.com.br';

    expect(buildQrCodeUrl('K7M2X9QP')).toBe(
      'HTTPS://TAGREATIVA.COM.BR/S/K7M2X9QP',
    );
  });

  it('fits a version 3 QR code at error correction level Q', () => {
    process.env.FRONTEND_URL = 'https://tagreativa.com.br';

    const qr = QRCode.create(buildQrCodeUrl('K7M2X9QP'), {
      errorCorrectionLevel: 'Q',
    });

    expect(qr.segments.map((segment) => segment.mode.id)).toEqual([
      'Alphanumeric',
    ]);
    expect(qr.version).toBe(3);
  });
});
