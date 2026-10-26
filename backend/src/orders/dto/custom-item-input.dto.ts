import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsInt, IsNotEmpty, IsNumber, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { MAX_ITEM_QUANTITY } from './order-item-input.dto';

/**
 * รายการราคาเปิด — พนักงานพิมพ์ชื่อ/ราคาเอง (ข้าวเพิ่ม, เมนูนอกรายการ) ไม่ผูกกับเมนู
 * รับเฉพาะ endpoint ของพนักงาน (POST /orders, /orders/takeaway) — หน้า QR ลูกค้าตั้งราคาเองไม่ได้
 * ทุกครั้งที่ใช้ถูกเก็บใน audit log (ORDER_CUSTOM_ITEM) เพราะตั้งราคาได้อิสระ
 */
export class CustomItemInputDto {
  @ApiProperty({ example: 'ข้าวเพิ่ม' })
  @IsString()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsNotEmpty()
  @MaxLength(60)
  name: string;

  @ApiProperty({ example: 10, description: 'ราคาต่อหน่วย (บาท)' })
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(100_000)
  price: number;

  @ApiProperty({ example: 1 })
  @IsInt()
  @Min(1)
  @Max(MAX_ITEM_QUANTITY)
  quantity: number;

  @ApiPropertyOptional({ example: 'ใส่ถุงแยก' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  note?: string;
}
