import { ApiProperty } from '@nestjs/swagger';
import { PaymentMethod } from '@prisma/client';
import { IsIn, IsString } from 'class-validator';
import { ACCEPTED_PAYMENT_METHODS } from '../../payments/accepted-payment-methods';

export class CheckoutDto {
  @ApiProperty({ example: 'qr-session-token' })
  @IsString()
  sessionToken: string;

  @ApiProperty({ enum: ACCEPTED_PAYMENT_METHODS, example: PaymentMethod.CASH })
  @IsIn(ACCEPTED_PAYMENT_METHODS)
  paymentMethod: PaymentMethod;
}
