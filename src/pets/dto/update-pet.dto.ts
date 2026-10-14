import {
  IsOptional,
  IsString,
  MinLength,
  MaxLength,
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
  @MaxLength(60)
  name?: string;

  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(40)
  species?: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
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
  @MaxLength(1000)
  @IsOptional()
  notes?: string | null;
}
