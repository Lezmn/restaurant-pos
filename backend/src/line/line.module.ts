import { Module } from '@nestjs/common';
import { LineMessagingService } from './line-messaging.service';
import { LineSettingsController } from './line-settings.controller';
import { LineSettingsService } from './line-settings.service';

@Module({
  controllers: [LineSettingsController],
  providers: [LineMessagingService, LineSettingsService],
  exports: [LineMessagingService],
})
export class LineModule {}
