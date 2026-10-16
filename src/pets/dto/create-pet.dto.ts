import {
  IsString,
  IsInt,
  IsOptional,
  Min,
  Max,
  MaxLength,
} from 'class-validator';
import { IsCloudinaryPhotoUrl } from '../../cloudinary/is-cloudinary-photo-url';

export class CreatePetDto {
  @IsString()
  @MaxLength(60)
  name!: string;

  @IsString()
  @MaxLength(40)
  species!: string;

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

  @IsString()
  @MaxLength(1000)
  @IsOptional()
  notes?: string;
}
