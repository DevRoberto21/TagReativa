import { IsString, IsBoolean } from 'class-validator';

export class CreatePetDto {
  @IsString()
  name!: string;

  @IsString()
  species!: string;

  @IsBoolean()
  physicalFallbackConsent!: boolean;
}
