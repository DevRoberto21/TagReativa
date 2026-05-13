import {
  IsEmail,
  IsString,
  Matches,
  MinLength,
  IsInt,
  IsOptional,
  Min,
} from 'class-validator';

export class CreateUserDto {
  @IsString()
  name!: string;

  @IsEmail()
  email!: string;

  @MinLength(6)
  password!: string;

  @Matches(/^55\d{2}\d{8,9}$/, {
    message:
      'whatsapp deve estar no formato internacional: 55DDD9XXXXXXXX (ex: 558194640291)',
  })
  whatsapp!: string;

  @IsOptional()
  @IsInt()
  @Min(18)
  age?: number;
}
