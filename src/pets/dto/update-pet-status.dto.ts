import { IsEnum } from 'class-validator';
import { PetStatus } from '@prisma/client';

export class UpdatePetStatusDto {
  @IsEnum(PetStatus)
  status!: PetStatus;
}
