import {
  IsOptional,
  IsString,
  MinLength,
  IsInt,
  Min,
  Max,
  IsBoolean,
  ValidateIf,
} from 'class-validator';
import { IsCloudinaryPhotoUrl } from '../../cloudinary/is-cloudinary-photo-url';

export class UpdatePetDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  name?: string;

  @IsOptional()
  @IsString()
  @MinLength(2)
  species?: string;

  @IsOptional()
  @IsString()
  breed?: string;

  @IsOptional()
  @IsCloudinaryPhotoUrl()
  photoUrl?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(50)
  age?: number;

  @IsOptional()
  @IsBoolean()
  physicalFallbackConsent?: boolean;

  @ValidateIf((object, value) => value !== null)
  @IsString()
  @IsOptional()
  notes?: string | null;
}
