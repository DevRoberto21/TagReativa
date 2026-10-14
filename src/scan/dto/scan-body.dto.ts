import {
  IsBoolean,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class ScanBodyDto {
  @IsOptional()
  @IsNumber()
  @Min(-90)
  @Max(90)
  latitude?: number;

  @IsOptional()
  @IsNumber()
  @Min(-180)
  @Max(180)
  longitude?: number;

  @IsBoolean()
  consentGranted!: boolean;

  @IsString()
  @MaxLength(16)
  consentVersion!: string;

  @IsOptional()
  @IsUUID()
  deviceId?: string;
}
