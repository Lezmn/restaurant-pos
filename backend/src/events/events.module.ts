import { Global, Module } from '@nestjs/common';
import { EventsGateway } from './events.gateway';

/** Global เพื่อให้ทุก service inject EventsGateway ได้โดยไม่ต้อง import module ซ้ำ */
@Global()
@Module({
  providers: [EventsGateway],
  exports: [EventsGateway],
})
export class EventsModule {}
