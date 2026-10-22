import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Min,
} from 'class-validator';

export class CreateMenuItemDto {
  @ApiProperty({ example: 'ผัดไทยกุ้งสด' })
  // trim ก่อน validate — ไม่งั้นชื่อช่องว่างล้วนผ่าน IsNotEmpty
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({ example: 89 })
  @IsNumber()
  @Min(0)
  price: number;

  @ApiPropertyOptional({ example: 'https://example.com/padthai.jpg' })
  @IsOptional()
  @IsString()
  imageUrl?: string;

  @ApiPropertyOptional({ example: true, default: true })
  @IsOptional()
  @IsBoolean()
  isAvailable?: boolean;

  @ApiProperty({ example: 'category-uuid' })
  @IsUUID()
  categoryId: string;

  @ApiPropertyOptional({
    type: [String],
    description:
      'วัตถุดิบหลักที่เมนูนี้ใช้เสมอ (ข้าวไข่เจียว → ไข่) วัตถุดิบหมดแล้วทั้งเมนูสั่งไม่ได้ — ส่งมา = แทนที่ของเดิมทั้งชุด',
  })
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsUUID(undefined, { each: true })
  ingredientIds?: string[];
}
