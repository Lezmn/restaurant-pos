import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

/** เพดานต่อบรรทัด — กันสั่งจำนวนมั่ว ๆ ผ่านลิงก์ QR (เกิน Int32 ยังทำ DB error 500 ด้วย) */
export const MAX_ITEM_QUANTITY = 99;

export class OrderItemInputDto {
  @ApiProperty({ example: 'menu-item-uuid' })
  @IsUUID()
  menuItemId: string;

  @ApiProperty({ example: 2, default: 1 })
  @IsInt()
  @Min(1)
  @Max(MAX_ITEM_QUANTITY)
  quantity: number;

  @ApiPropertyOptional({ example: 'ไม่ใส่ผักชี' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  note?: string;

  @ApiPropertyOptional({
    type: [String],
    example: ['option-uuid-egg', 'option-uuid-pork'],
    description: 'รายการ option ที่เลือกจากกลุ่มของเมนูนี้',
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @ArrayUnique()
  @IsUUID('4', { each: true })
  optionIds?: string[];
}
