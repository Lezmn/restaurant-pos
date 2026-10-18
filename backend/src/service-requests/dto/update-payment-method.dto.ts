import { ApiProperty } from '@nestjs/swagger';
import { PaymentMethod } from '@prisma/client';
import { IsIn } from 'class-validator';
import { ACCEPTED_PAYMENT_METHODS } from '../../payments/accepted-payment-methods';

export class UpdatePaymentMethodDto {
  @ApiProperty({ enum: ACCEPTED_PAYMENT_METHODS, example: PaymentMethod.CASH })
  @IsIn(ACCEPTED_PAYMENT_METHODS)
  paymentMethod: PaymentMethod;
}
