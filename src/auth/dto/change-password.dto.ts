import { IsNotEmpty, IsString, MaxLength } from 'class-validator';
import { IsPasswordPolicy } from '../password-policy';

export class ChangePasswordDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(72)
  currentPassword!: string;

  @IsPasswordPolicy()
  newPassword!: string;
}
