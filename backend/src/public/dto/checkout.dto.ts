import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PaymentMethod } from '@prisma/client';
import { IsIn, IsOptional, IsString } from 'class-validator';
import { ACCEPTED_PAYMENT_METHODS } from '../../payments/accepted-payment-methods';

export class CheckoutDto {
  @ApiProperty({ example: 'qr-session-token' })
  @IsString()
  sessionToken: string;

  /** ไม่ส่ง = ลูกค้าแค่แจ้งว่าจะจ่าย ให้พนักงานถามวิธีจ่ายที่เคาน์เตอร์ */
  @ApiPropertyOptional({ enum: ACCEPTED_PAYMENT_METHODS, example: PaymentMethod.CASH })
  @IsOptional()
  @IsIn(ACCEPTED_PAYMENT_METHODS)
  paymentMethod?: PaymentMethod;
}
