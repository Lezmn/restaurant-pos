import { Module } from '@nestjs/common';
import { SlipOkModule } from '../slipok/slipok.module';
import { PaymentSlipService } from './payment-slip.service';
import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';

@Module({
  imports: [SlipOkModule],
  controllers: [PaymentsController],
  providers: [PaymentsService, PaymentSlipService],
})
export class PaymentsModule {}
