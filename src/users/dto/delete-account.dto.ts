import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class DeleteAccountDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(72)
  password!: string;
}
