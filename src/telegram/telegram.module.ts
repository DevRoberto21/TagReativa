import { Module } from '@nestjs/common';
import { TelegramService } from './telegram.service';
import { TelegramLinkService } from './telegram-link.service';
import { TelegramUpdatesService } from './telegram-updates.service';
import { TelegramController } from './telegram.controller';

@Module({
  providers: [TelegramService, TelegramLinkService, TelegramUpdatesService],
  controllers: [TelegramController],
  exports: [TelegramService],
})
export class TelegramModule {}
