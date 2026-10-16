import { IsString, MaxLength } from 'class-validator';

export class DisableTwoFactorDto {
  @IsString()
  @MaxLength(72)
  password!: string;
}
