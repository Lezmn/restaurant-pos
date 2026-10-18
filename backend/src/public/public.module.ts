import { Module } from '@nestjs/common';
import { OrdersModule } from '../orders/orders.module';
import { PrismaModule } from '../prisma/prisma.module';
import { ServiceRequestsModule } from '../service-requests/service-requests.module';
import { TableSessionsModule } from '../table-sessions/table-sessions.module';
import { PublicController } from './public.controller';
import { PublicService } from './public.service';

@Module({
  imports: [PrismaModule, OrdersModule, ServiceRequestsModule, TableSessionsModule],
  controllers: [PublicController],
  providers: [PublicService],
})
export class PublicModule {}
