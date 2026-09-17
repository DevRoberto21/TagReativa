import { createHash } from 'crypto';
import { CloudinaryService } from './cloudinary.service';

describe('CloudinaryService', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = {
      ...originalEnv,
      CLOUDINARY_API_KEY: 'test-api-key',
      CLOUDINARY_API_SECRET: 'test-api-secret',
    };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('returns a valid signature payload', () => {
    const service = new CloudinaryService();

    const result = service.generateUploadSignature();

    expect(result.signature).toMatch(/^[a-f0-9]{40}$/);
    expect(typeof result.timestamp).toBe('number');
    expect(result.apiKey).toBe('test-api-key');
    expect(result.cloudName).toBe('dan2bsmlk');
    expect(result.uploadPreset).toBe('tagreativa_pictures');
  });

  it('computes the signature using the correct algorithm', () => {
    const service = new CloudinaryService();

    const result = service.generateUploadSignature();

    const expectedSignature = createHash('sha1')
      .update(
        `timestamp=${result.timestamp}&upload_preset=tagreativa_pictures` +
          'test-api-secret',
      )
      .digest('hex');

    expect(result.signature).toBe(expectedSignature);
  });

  it('throws when CLOUDINARY_API_KEY is missing', () => {
    delete process.env.CLOUDINARY_API_KEY;

    expect(() => new CloudinaryService()).toThrow(
      'FATAL: CLOUDINARY_API_KEY não definido.',
    );
  });

  it('throws when CLOUDINARY_API_SECRET is missing', () => {
    delete process.env.CLOUDINARY_API_SECRET;

    expect(() => new CloudinaryService()).toThrow(
      'FATAL: CLOUDINARY_API_SECRET não definido.',
    );
  });
});
