import { IsEmail, IsString, Matches, MinLength } from 'class-validator';

export class CreateUserDto {
  @IsString()
  name!: string;

  @IsEmail()
  email!: string;

  @MinLength(6)
  password!: string;

  @Matches(/^\d{2}9\d{4}-?\d{4}$/, {
    message: 'whatsapp deve estar no formato (DD)9XXXX-XXXX',
  })
  whatsapp!: string;
}
