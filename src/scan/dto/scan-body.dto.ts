import {
  IsBoolean,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
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
  consentVersion!: string;

  @IsOptional()
  @IsUUID()
  deviceId?: string;
}
