import {
  IsOptional,
  IsString,
  Matches,
  MinLength,
  IsInt,
  Min,
} from 'class-validator';

export class UpdateUserDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  name?: string;

  @IsOptional()
  @Matches(/^55\d{2}\d{8,9}$/, {
    message:
      'whatsapp deve estar no formato internacional: 55DDD9XXXXXXXX (ex: 558194640291)',
  })
  whatsapp?: string;

  @IsOptional()
  @IsInt()
  @Min(18)
  age?: number;
}
