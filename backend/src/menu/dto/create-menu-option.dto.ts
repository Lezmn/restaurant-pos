import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { MenuOptionGroup } from '@prisma/client';
import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
} from 'class-validator';

export class CreateMenuOptionDto {
  @ApiProperty({ example: 'ไข่ดาว' })
  // trim ก่อน validate — ไม่งั้น "   " ผ่าน IsNotEmpty แล้วกลายเป็นชื่อว่าง
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiPropertyOptional({
    enum: MenuOptionGroup,
    default: MenuOptionGroup.EXTRA,
    description: 'PROTEIN = เนื้อสัตว์, EXTRA = เพิ่มเติมอื่น ๆ (ไม่ส่งมาจะเป็น EXTRA)',
  })
  @IsOptional()
  @IsEnum(MenuOptionGroup)
  group?: MenuOptionGroup;

  @ApiPropertyOptional({ example: 10, default: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  price?: number;

  @ApiPropertyOptional({
    example: true,
    default: true,
    description: 'ตัวเลือกที่ผูกวัตถุดิบแล้วปิดไม่ได้ ให้ปิดที่วัตถุดิบแทน',
  })
  @IsOptional()
  @IsBoolean()
  isAvailable?: boolean;

  @ApiPropertyOptional({
    description:
      'ผูกกับวัตถุดิบ — วัตถุดิบหมดแล้วตัวเลือกนี้จะสั่งไม่ได้ทุกเมนู (null = ไม่ผูก)',
  })
  @IsOptional()
  @IsUUID()
  ingredientId?: string | null;

  @ApiPropertyOptional({
    example: 1,
    default: 1,
    description:
      'ใช้วัตถุดิบที่ผูกไว้กี่หน่วยต่อจาน (ตัดสต็อกตามนี้) — 0 = ผูกไว้ให้หมดตามอย่างเดียว ไม่ตัดเพิ่ม',
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(99)
  usageQty?: number;
}
