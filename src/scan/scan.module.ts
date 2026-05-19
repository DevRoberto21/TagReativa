import { Module } from '@nestjs/common';
import { ScanService } from './scan.service';
import { ScanController } from './scan.controller';
import { CallMeBotModule } from '../callmebot/callmebot.module';

@Module({
  imports: [CallMeBotModule],
  providers: [ScanService],
  controllers: [ScanController],
})
export class ScanModule {}
