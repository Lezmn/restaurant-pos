import { Module } from '@nestjs/common';
import { LineModule } from '../line/line.module';
import { CashClosesController } from './cash-closes.controller';
import { CashClosesService } from './cash-closes.service';

@Module({
  imports: [LineModule],
  controllers: [CashClosesController],
  providers: [CashClosesService],
})
export class CashClosesModule {}
