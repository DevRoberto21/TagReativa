import { Module } from '@nestjs/common';
import { ScanService } from './scan.service';
import { ScanController } from './scan.controller';
import { CallMeBotModule } from '../callmebot/callmebot.module';
import { EmailModule } from '../email/email.module';

@Module({
  imports: [CallMeBotModule, EmailModule],
  providers: [ScanService],
  controllers: [ScanController],
})
export class ScanModule {}
