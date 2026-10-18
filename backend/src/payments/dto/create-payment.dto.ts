import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PaymentMethod } from '@prisma/client';
import { Transform, Type } from 'class-transformer';
import {
  ArrayNotEmpty,
  IsArray,
  IsIn,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
} from 'class-validator';
import { ACCEPTED_PAYMENT_METHODS } from '../accepted-payment-methods';

export class CreatePaymentDto {
  @ApiPropertyOptional({
    example: 'table-session-uuid',
    description: 'เก็บเงินทั้ง session (ต้องเสิร์ฟครบทุกออเดอร์) — ถ้าส่ง orderIds มาด้วยจะใช้ orderIds แทน',
  })
  @IsOptional()
  // ไม่บังคับเป็น UUID เพราะ session ที่ถูก backfill จาก migration
  // ใช้ id รูปแบบ 'migrated-payment-<paymentId>' ซึ่งเก็บเงินไม่ได้เลยถ้าเช็ค UUID
  @IsString()
  @IsNotEmpty()
  tableSessionId?: string;

  @ApiPropertyOptional({
    type: [String],
    example: ['order-uuid-1', 'order-uuid-2'],
    description:
      'เก็บเงินเฉพาะออเดอร์ที่ระบุ — ใช้แยกบิล (บางออเดอร์ในโต๊ะ) หรือรวมบิล (ออเดอร์ข้ามโต๊ะ)',
  })
  @IsOptional()
  @IsArray()
  @ArrayNotEmpty()
  @IsUUID('4', { each: true })
  orderIds?: string[];

  @ApiProperty({ enum: ACCEPTED_PAYMENT_METHODS, example: PaymentMethod.CASH })
  @IsIn(ACCEPTED_PAYMENT_METHODS)
  method: PaymentMethod;

  @ApiPropertyOptional({
    example: 250,
    description:
      'ยอดที่เก็บจริง (ไม่ส่ง = เก็บเต็มตามบิล) ต่ำกว่ายอดบิลได้ ส่วนต่างบันทึกเป็นส่วนลดในใบเสร็จ',
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  amount?: number;

  @ApiPropertyOptional({
    example: 300,
    description:
      'ยอดบิลที่หน้าจอแคชเชียร์แสดงอยู่ (ก่อนส่วนลด) — ถ้ายอดจริงตอนบันทึกไม่ตรง (มีออเดอร์ถูกยกเลิก/เสิร์ฟเพิ่มระหว่างเปิดหน้ารับเงิน) จะตอบ 409',
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  expectedTotal?: number;

  @ApiPropertyOptional({
    example: '0041000600000101030060217...',
    description:
      'PromptPay: ข้อความใน QR มุมขวาล่างของสลิป (จากเครื่องสแกน/อ่านจากรูป) — backend ส่งไปตรวจกับ SlipOK ก่อนบันทึก',
  })
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  slipPayload?: string;

  @ApiPropertyOptional({
    example: 'ลูกค้าโอนผ่านแอปที่ไม่มี QR บนสลิป ตรวจยอดเข้าในแอปธนาคารแล้ว',
    description:
      'PromptPay ไม่มีสลิปให้ตรวจ — เฉพาะ ADMIN ยืนยันเองได้ ต้องใส่เหตุผล (เก็บไว้ตรวจย้อนหลัง)',
  })
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  slipOverrideReason?: string;

  @ApiPropertyOptional({
    example: 'ลูกค้าขอใบกำกับภาษี',
    description: 'หมายเหตุตอนรับเงิน — เก็บลง payment และพิมพ์ท้ายใบเสร็จ',
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}
