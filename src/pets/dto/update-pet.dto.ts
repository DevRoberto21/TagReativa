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
  @IsString()
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
