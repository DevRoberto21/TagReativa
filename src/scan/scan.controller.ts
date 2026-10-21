import {
  Controller,
  Post,
  Get,
  Param,
  Body,
  Req,
  BadRequestException,
  PipeTransform,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import { isUUID } from 'class-validator';
import { SHORT_CODE_PATTERN } from '../pets/short-code';
import { ScanService } from './scan.service';
import { ScanBodyDto } from './dto/scan-body.dto';

// Tags printed before short codes carry the pet UUID, so both forms are valid.
const PetIdPipe: PipeTransform<string, string> = {
  transform(value) {
    if (isUUID(value) || SHORT_CODE_PATTERN.test(value)) return value;
    throw new BadRequestException('Código da tag inválido.');
  },
};

@Controller('scan')
export class ScanController {
  constructor(private readonly scanService: ScanService) {}

  @Get(':petId/status')
  @Throttle({ default: { ttl: 60000, limit: 20 } })
  status(@Param('petId', PetIdPipe) petId: string) {
    return this.scanService.getStatus(petId);
  }

  @Post(':petId')
  @Throttle({ default: { ttl: 60000, limit: 5 } })
  scan(
    @Param('petId', PetIdPipe) petId: string,
    @Body() body: ScanBodyDto,
    @Req() req: Request,
  ) {
    // req.ip honours the 'trust proxy' setting in main.ts, so a client-supplied
    // x-forwarded-for entry cannot spoof the address.
    const ipAddress = req.ip ?? req.socket.remoteAddress ?? 'unknown';

    return this.scanService.processScan({
      petId,
      latitude: body.latitude,
      longitude: body.longitude,
      ipAddress,
      consentGranted: body.consentGranted,
      consentVersion: body.consentVersion,
      deviceId: body.deviceId,
    });
  }
}
