import { Module } from '@nestjs/common';
import { ScanService } from './scan.service';
import { ScanController } from './scan.controller';
import { TelegramModule } from '../telegram/telegram.module';
import { EmailModule } from '../email/email.module';

@Module({
  imports: [TelegramModule, EmailModule],
  providers: [ScanService],
  controllers: [ScanController],
})
export class ScanModule {}
