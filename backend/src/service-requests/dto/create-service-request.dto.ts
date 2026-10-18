import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PaymentMethod, ServiceRequestType } from '@prisma/client';
import { IsEnum, IsIn, IsOptional, IsUUID } from 'class-validator';
import { ACCEPTED_PAYMENT_METHODS } from '../../payments/accepted-payment-methods';

export class CreateServiceRequestDto {
  @ApiProperty({ example: 'table-uuid' })
  @IsUUID()
  tableId: string;

  @ApiPropertyOptional({ example: 'table-session-uuid' })
  @IsOptional()
  @IsUUID()
  tableSessionId?: string;

  @ApiProperty({
    enum: ServiceRequestType,
    example: ServiceRequestType.CALL_STAFF,
  })
  @IsEnum(ServiceRequestType)
  type: ServiceRequestType;

  @ApiPropertyOptional({
    enum: ACCEPTED_PAYMENT_METHODS,
    example: PaymentMethod.CASH,
    description: 'เฉพาะ type=CHECKOUT: วิธีจ่ายเงินที่ลูกค้าเลือกไว้',
  })
  @IsOptional()
  @IsIn(ACCEPTED_PAYMENT_METHODS)
  paymentMethod?: PaymentMethod;
}
