import { Module } from '@nestjs/common';
import { CashClosesController } from './cash-closes.controller';
import { CashClosesService } from './cash-closes.service';

@Module({
  controllers: [CashClosesController],
  providers: [CashClosesService],
})
export class CashClosesModule {}
