import { IsString, Length, Matches } from 'class-validator';

export class VerifyTwoFactorDto {
  @IsString()
  loginToken!: string;

  @IsString()
  @Length(6, 6)
  @Matches(/^\d{6}$/, {
    message: 'code deve conter exatamente 6 dígitos numéricos',
  })
  code!: string;
}
