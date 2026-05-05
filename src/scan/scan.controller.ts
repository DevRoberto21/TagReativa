import { Controller, Post, Param, Body, Req } from '@nestjs/common';
import type { Request } from 'express';
import { ScanService } from './scan.service';

interface ScanBody {
  latitude?: number;
  longitude?: number;
  consentGranted: boolean;
  consentVersion: string;
}

@Controller('scan')
export class ScanController {
  constructor(private readonly scanService: ScanService) {}

  @Post(':petId')
  scan(
    @Param('petId') petId: string,
    @Body() body: ScanBody,
    @Req() req: Request,
  ) {
    const ipAddress =
      (req.headers['x-forwarded-for'] as string)?.split(',')[0] ??
      req.socket.remoteAddress ??
      'unknown';

    return this.scanService.processScan({
      petId,
      latitude: body.latitude,
      longitude: body.longitude,
      ipAddress,
      consentGranted: body.consentGranted,
      consentVersion: body.consentVersion,
    });
  }
}
