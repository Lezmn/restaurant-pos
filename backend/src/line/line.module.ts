import { Module } from '@nestjs/common';
import { LineMessagingService } from './line-messaging.service';

@Module({
  providers: [LineMessagingService],
  exports: [LineMessagingService],
})
export class LineModule {}
