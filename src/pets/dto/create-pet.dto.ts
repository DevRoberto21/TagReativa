import {
  IsString,
  IsBoolean,
  IsInt,
  IsOptional,
  Min,
  Max,
} from 'class-validator';

export class CreatePetDto {
  @IsString()
  name!: string;

  @IsString()
  species!: string;

  @IsBoolean()
  physicalFallbackConsent!: boolean;

  @IsOptional()
  @IsString()
  breed?: string;

  @IsOptional()
  @IsString()
  photoUrl?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(50)
  age?: number;
}
