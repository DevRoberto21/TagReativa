import {
  IsOptional,
  IsString,
  MinLength,
  IsInt,
  Min,
  Max,
} from 'class-validator';
import { Transform } from 'class-transformer';

export class UpdatePetDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  name?: string;

  @IsOptional()
  @Transform(({ value }: { value: string }) => value.toLowerCase())
  @IsString()
  @MinLength(2)
  species?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(50)
  age?: number;
}
