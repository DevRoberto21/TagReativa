import { Controller, Get } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';

// Keep-alive target for the uptime pinger. It must not query the database:
// pinging Neon every few minutes would keep it awake and burn free compute hours.
@Controller('health')
@SkipThrottle()
export class HealthController {
  @Get()
  check() {
    return { status: 'ok' };
  }
}
