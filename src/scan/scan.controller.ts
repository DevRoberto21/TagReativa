import { Controller, Post, Param, Body, Req } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import { ScanService } from './scan.service';
import { ScanBodyDto } from './dto/scan-body.dto';

@Controller('scan')
export class ScanController {
  constructor(private readonly scanService: ScanService) {}

  @Post(':petId')
  @Throttle({ default: { ttl: 60000, limit: 5 } })
  scan(
    @Param('petId') petId: string,
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
