import { Module } from '@nestjs/common';
import { LineModule } from '../line/line.module';
import { SlipOkModule } from '../slipok/slipok.module';
import { HealthController } from './health.controller';
import { SystemStatusController } from './system-status.controller';
import { SystemStatusService } from './system-status.service';

@Module({
  imports: [SlipOkModule, LineModule],
  controllers: [HealthController, SystemStatusController],
  providers: [SystemStatusService],
})
export class HealthModule {}
