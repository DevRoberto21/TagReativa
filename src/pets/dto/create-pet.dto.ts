import {
  IsString,
  IsBoolean,
  IsInt,
  IsOptional,
  Min,
  Max,
} from 'class-validator';
import { Transform } from 'class-transformer';

export class CreatePetDto {
  @IsString()
  name!: string;

  @Transform(({ value }: { value: string }) => value.toLowerCase())
  @IsString()
  species!: string;

  @IsBoolean()
  physicalFallbackConsent!: boolean;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(50)
  age?: number;
}
