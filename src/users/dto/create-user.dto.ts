import {
  IsEmail,
  IsString,
  Matches,
  IsInt,
  IsOptional,
  Min,
} from 'class-validator';
import { IsPasswordPolicy } from '../../auth/password-policy';

export class CreateUserDto {
  @IsString()
  name!: string;

  @IsEmail()
  email!: string;

  @IsPasswordPolicy()
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
