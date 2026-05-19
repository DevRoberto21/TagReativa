import { Module } from '@nestjs/common';
import { CallMeBotService } from './callmebot.service';

@Module({
  providers: [CallMeBotService],
  exports: [CallMeBotService],
})
export class CallMeBotModule {}
