import { IsNotEmpty, IsString } from 'class-validator';
import { IsPasswordPolicy } from '../password-policy';

export class ChangePasswordDto {
  @IsString()
  @IsNotEmpty()
  currentPassword!: string;

  @IsPasswordPolicy()
  newPassword!: string;
}
