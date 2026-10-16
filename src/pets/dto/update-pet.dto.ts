import {
  IsOptional,
  IsString,
  MinLength,
  MaxLength,
  IsInt,
  Min,
  Max,
  IsNotEmpty,
  ValidateIf,
} from 'class-validator';
import { IsCloudinaryPhotoUrl } from '../../cloudinary/is-cloudinary-photo-url';

// name and species are required columns: absent means "keep", null is refused.
export class UpdatePetDto {
  @ValidateIf((_, value) => value !== undefined)
  @IsNotEmpty()
  @IsString()
  @MinLength(2)
  @MaxLength(60)
  name?: string;

  @ValidateIf((_, value) => value !== undefined)
  @IsNotEmpty()
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

  @ValidateIf((object, value) => value !== null)
  @IsString()
  @MaxLength(1000)
  @IsOptional()
  notes?: string | null;
}
