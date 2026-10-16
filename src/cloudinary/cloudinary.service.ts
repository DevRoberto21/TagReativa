import { Injectable } from '@nestjs/common';
import { createHash, randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { describeError } from '../describe-error';

export const CLOUDINARY_CLOUD_NAME = 'dan2bsmlk';
const CLOUDINARY_UPLOAD_PRESET = 'tagreativa_pictures';
const DESTROY_TIMEOUT_MS = 10_000;
// Delivery URL of an original upload: optional version, then the public_id
// and the format extension. `..` is rejected as in IsCloudinaryPhotoUrl.
const DELIVERY_URL = new RegExp(
  `^https://res\\.cloudinary\\.com/${CLOUDINARY_CLOUD_NAME}/image/upload/(?!.*\\.\\.)(?:v\\d+/)?([A-Za-z0-9_\\-./,]+)\\.[A-Za-z0-9]+$`,
);

export function publicIdFromUrl(url: string): string | null {
  return DELIVERY_URL.exec(url)?.[1] ?? null;
}

export interface CloudinaryUploadSignature {
  signature: string;
  timestamp: number;
  apiKey: string;
  cloudName: string;
  uploadPreset: string;
  publicId: string;
}

@Injectable()
export class CloudinaryService {
  private readonly apiKey: string;
  private readonly apiSecret: string;

  constructor(private prisma: PrismaService) {
    const apiKey = process.env.CLOUDINARY_API_KEY;
    if (!apiKey) throw new Error('FATAL: CLOUDINARY_API_KEY não definido.');
    const apiSecret = process.env.CLOUDINARY_API_SECRET;
    if (!apiSecret) {
      throw new Error('FATAL: CLOUDINARY_API_SECRET não definido.');
    }
    this.apiKey = apiKey;
    this.apiSecret = apiSecret;
  }

  // Params must be sorted by name, as Cloudinary rebuilds the string that way.
  private sign(params: string): string {
    return createHash('sha1')
      .update(params + this.apiSecret)
      .digest('hex');
  }

  // A fixed public_id under the owner's prefix ties each signature to one
  // asset of one owner, whatever the account's folder mode is.
  generateUploadSignature(ownerId: string): CloudinaryUploadSignature {
    const timestamp = Math.floor(Date.now() / 1000);
    const publicId = `pets/${ownerId}/${randomUUID()}`;
    const signature = this.sign(
      `public_id=${publicId}&timestamp=${timestamp}&upload_preset=${CLOUDINARY_UPLOAD_PRESET}`,
    );

    return {
      signature,
      timestamp,
      apiKey: this.apiKey,
      cloudName: CLOUDINARY_CLOUD_NAME,
      uploadPreset: CLOUDINARY_UPLOAD_PRESET,
      publicId,
    };
  }

  isOwnedPhotoUrl(url: string, ownerId: string): boolean {
    const publicId = publicIdFromUrl(url);
    const prefix = `pets/${ownerId}/`;
    return (
      !!publicId &&
      publicId.startsWith(prefix) &&
      !publicId.slice(prefix.length).includes('/')
    );
  }

  // Removes photos no pet points to anymore. Failures are only logged: the
  // user's own operation already succeeded.
  async deleteUnusedPhotos(urls: (string | null)[]): Promise<void> {
    await Promise.all(
      urls.map(async (url) => {
        const publicId = url ? publicIdFromUrl(url) : null;
        if (!url || !publicId) return;
        try {
          if (await this.prisma.pet.count({ where: { photoUrl: url } })) return;
          await this.destroy(publicId);
        } catch (err) {
          console.error(
            '[CLOUDINARY] falha ao apagar foto:',
            describeError(err),
          );
        }
      }),
    );
  }

  private async destroy(publicId: string): Promise<void> {
    const timestamp = Math.floor(Date.now() / 1000);
    const body = new URLSearchParams({
      public_id: publicId,
      timestamp: String(timestamp),
      api_key: this.apiKey,
      signature: this.sign(`public_id=${publicId}&timestamp=${timestamp}`),
    });
    const res = await fetch(
      `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/image/destroy`,
      {
        method: 'POST',
        body,
        signal: AbortSignal.timeout(DESTROY_TIMEOUT_MS),
      },
    );
    const data = (await res.json()) as { result?: string };
    // "not found" means it is already gone, which is the goal.
    if (data.result !== 'ok' && data.result !== 'not found') {
      throw new Error(`destroy respondeu ${res.status}`);
    }
  }
}
