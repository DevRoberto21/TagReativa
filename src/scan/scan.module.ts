import { Module } from '@nestjs/common';
import { ScanService } from './scan.service';
import { ScanController } from './scan.controller';

@Module({
  providers: [ScanService],
  controllers: [ScanController]
})
export class ScanModule {}
