import { applyDecorators } from '@nestjs/common';
import { IsString, Matches, MaxLength } from 'class-validator';
import { CLOUDINARY_CLOUD_NAME } from './cloudinary.service';

// Only image URLs from the project's own Cloudinary account are accepted,
// since photoUrl is rendered on the public scan page. The path is limited to
// a safe character set (no `%`, `?`, `#`, `@`) and `..` is rejected so a URL
// cannot escape to another account after browser normalization.
const CLOUDINARY_PHOTO_URL = new RegExp(
  `^https://res\\.cloudinary\\.com/${CLOUDINARY_CLOUD_NAME}/image/upload/(?!.*\\.\\.)[A-Za-z0-9_\\-./,]+$`,
);

export function IsCloudinaryPhotoUrl() {
  return applyDecorators(
    IsString(),
    MaxLength(500),
    Matches(CLOUDINARY_PHOTO_URL, {
      message:
        'photoUrl deve ser uma imagem enviada pelo upload do TagReativa.',
    }),
  );
}
