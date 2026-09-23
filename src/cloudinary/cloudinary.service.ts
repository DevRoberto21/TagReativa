import { Injectable } from '@nestjs/common';
import { createHash } from 'crypto';

export const CLOUDINARY_CLOUD_NAME = 'dan2bsmlk';
const CLOUDINARY_UPLOAD_PRESET = 'tagreativa_pictures';

export interface CloudinaryUploadSignature {
  signature: string;
  timestamp: number;
  apiKey: string;
  cloudName: string;
  uploadPreset: string;
}

@Injectable()
export class CloudinaryService {
  private readonly apiKey: string;
  private readonly apiSecret: string;

  constructor() {
    const apiKey = process.env.CLOUDINARY_API_KEY;
    if (!apiKey) throw new Error('FATAL: CLOUDINARY_API_KEY não definido.');
    const apiSecret = process.env.CLOUDINARY_API_SECRET;
    if (!apiSecret) {
      throw new Error('FATAL: CLOUDINARY_API_SECRET não definido.');
    }

    this.apiKey = apiKey;
    this.apiSecret = apiSecret;
  }

  generateUploadSignature(): CloudinaryUploadSignature {
    const timestamp = Math.floor(Date.now() / 1000);
    const paramsToSign = `timestamp=${timestamp}&upload_preset=${CLOUDINARY_UPLOAD_PRESET}`;
    const signature = createHash('sha1')
      .update(paramsToSign + this.apiSecret)
      .digest('hex');

    return {
      signature,
      timestamp,
      apiKey: this.apiKey,
      cloudName: CLOUDINARY_CLOUD_NAME,
      uploadPreset: CLOUDINARY_UPLOAD_PRESET,
    };
  }
}
