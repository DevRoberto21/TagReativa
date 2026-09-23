import { IsString } from 'class-validator';
import { IsPasswordPolicy } from '../password-policy';

export class ResetPasswordDto {
  @IsString()
  token!: string;

  @IsPasswordPolicy()
  newPassword!: string;
}
