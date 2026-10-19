import { createHash } from 'crypto';
import { CloudinaryService, publicIdFromUrl } from './cloudinary.service';
import { PrismaService } from '../prisma/prisma.service';

describe('CloudinaryService', () => {
  const originalEnv = process.env;
  let prisma: { pet: { count: jest.Mock } };
  const newService = () =>
    new CloudinaryService(prisma as unknown as PrismaService);

  beforeEach(() => {
    process.env = {
      ...originalEnv,
      CLOUDINARY_API_KEY: 'test-api-key',
      CLOUDINARY_API_SECRET: 'test-api-secret',
    };
    prisma = { pet: { count: jest.fn().mockResolvedValue(0) } };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('returns a valid signature payload', () => {
    const result = newService().generateUploadSignature('owner-1');

    expect(result.signature).toMatch(/^[a-f0-9]{40}$/);
    expect(typeof result.timestamp).toBe('number');
    expect(result.apiKey).toBe('test-api-key');
    expect(result.cloudName).toBe('dan2bsmlk');
    expect(result.uploadPreset).toBe('tagreativa_pictures');
  });

  it('binds each signature to a fresh public_id under the owner', () => {
    const service = newService();
    const a = service.generateUploadSignature('owner-1');
    const b = service.generateUploadSignature('owner-1');

    expect(a.publicId).toMatch(/^pets\/owner-1\/[0-9a-f-]{36}$/);
    expect(b.publicId).not.toBe(a.publicId);
  });

  it('computes the signature over public_id, timestamp and preset', () => {
    const result = newService().generateUploadSignature('owner-1');

    const expectedSignature = createHash('sha1')
      .update(
        `public_id=${result.publicId}&timestamp=${result.timestamp}` +
          '&upload_preset=tagreativa_pictures' +
          'test-api-secret',
      )
      .digest('hex');
    expect(result.signature).toBe(expectedSignature);
  });

  it('throws when CLOUDINARY_API_KEY is missing', () => {
    delete process.env.CLOUDINARY_API_KEY;
    expect(newService).toThrow('FATAL: CLOUDINARY_API_KEY não definido.');
  });

  it('throws when CLOUDINARY_API_SECRET is missing', () => {
    delete process.env.CLOUDINARY_API_SECRET;
    expect(newService).toThrow('FATAL: CLOUDINARY_API_SECRET não definido.');
  });

  describe('isOwnedPhotoUrl', () => {
    const base = 'https://res.cloudinary.com/dan2bsmlk/image/upload';

    it.each([
      [`${base}/v1700000000/pets/owner-1/abc-123.jpg`, true],
      [`${base}/pets/owner-1/abc-123.webp`, true],
      [`${base}/v1700000000/pets/owner-2/abc-123.jpg`, false],
      [`${base}/v1700000000/pets/owner-1x/abc-123.jpg`, false],
      [`${base}/v1700000000/old_photo.jpg`, false],
      [`${base}/v1/pets/owner-1/../owner-2/abc.jpg`, false],
      [
        'https://res.cloudinary.com/other/image/upload/pets/owner-1/a.jpg',
        false,
      ],
    ])('%s → %s', (url, owned) => {
      expect(newService().isOwnedPhotoUrl(url, 'owner-1')).toBe(owned);
    });
  });

  describe('publicIdFromUrl', () => {
    it.each([
      [
        'https://res.cloudinary.com/dan2bsmlk/image/upload/v1700000000/pets/owner-1/abc.jpg',
        'pets/owner-1/abc',
      ],
      [
        'https://res.cloudinary.com/dan2bsmlk/image/upload/v1700000000/old_photo.png',
        'old_photo',
      ],
      ['https://res.cloudinary.com/other/image/upload/v1/x.jpg', null],
      ['https://example.com/x.jpg', null],
    ])('%s → %s', (url, publicId) => {
      expect(publicIdFromUrl(url)).toBe(publicId);
    });
  });

  describe('deleteUnusedPhotos', () => {
    const url =
      'https://res.cloudinary.com/dan2bsmlk/image/upload/v1700000000/pets/owner-1/abc.jpg';
    let fetchMock: jest.SpyInstance;

    beforeEach(() => {
      fetchMock = jest
        .spyOn(global, 'fetch')
        .mockResolvedValue(Response.json({ result: 'ok' }));
    });

    afterEach(() => fetchMock.mockRestore());

    it('destroys the asset with a signed request', async () => {
      jest.spyOn(Date, 'now').mockReturnValue(1_700_000_000_000);

      await newService().deleteUnusedPhotos([url]);

      const [endpoint, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(endpoint).toBe(
        'https://api.cloudinary.com/v1_1/dan2bsmlk/image/destroy',
      );
      const body = init.body as URLSearchParams;
      expect(init.method).toBe('POST');
      expect(init.signal).toBeInstanceOf(AbortSignal);
      expect(body.get('public_id')).toBe('pets/owner-1/abc');
      expect(body.get('api_key')).toBe('test-api-key');
      expect(body.get('timestamp')).toBe('1700000000');
      expect(body.get('signature')).toBe(
        createHash('sha1')
          .update(
            'public_id=pets/owner-1/abc&timestamp=1700000000test-api-secret',
          )
          .digest('hex'),
      );
      jest.restoreAllMocks();
    });

    it('keeps a photo another pet still points to', async () => {
      prisma.pet.count.mockResolvedValue(1);

      await newService().deleteUnusedPhotos([url]);

      expect(prisma.pet.count).toHaveBeenCalledWith({
        where: { photoUrl: url },
      });
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('skips empty and foreign URLs', async () => {
      await newService().deleteUnusedPhotos([
        null,
        '',
        'https://example.com/x.jpg',
      ]);

      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('only logs when Cloudinary fails', async () => {
      const log = jest.spyOn(console, 'error').mockImplementation(() => {});
      fetchMock.mockRejectedValue(new Error('network down'));

      await expect(newService().deleteUnusedPhotos([url])).resolves.toBe(
        undefined,
      );
      fetchMock.mockResolvedValue(Response.json({ error: { message: 'x' } }));
      await newService().deleteUnusedPhotos([url]);

      expect(log).toHaveBeenCalledTimes(2);
      log.mockRestore();
    });
  });
});
