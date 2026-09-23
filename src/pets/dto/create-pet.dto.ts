import { IsString, IsInt, IsOptional, Min, Max } from 'class-validator';
import { IsCloudinaryPhotoUrl } from '../../cloudinary/is-cloudinary-photo-url';

export class CreatePetDto {
  @IsString()
  name!: string;

  @IsString()
  species!: string;

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

  @IsString()
  @IsOptional()
  notes?: string;
}
