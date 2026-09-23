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
    const ipAddress =
      (req.headers['x-forwarded-for'] as string)?.split(',')[0] ??
      req.socket.remoteAddress ??
      'unknown';

    console.log('[SCAN] ip:', ipAddress, '| x-forwarded-for:', req.headers['x-forwarded-for']);
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
