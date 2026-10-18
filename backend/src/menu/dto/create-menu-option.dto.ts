import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { MenuOptionGroup } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Min,
} from 'class-validator';

export class CreateMenuOptionDto {
  @ApiProperty({ example: 'ไข่ดาว' })
  @IsString()
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

  @ApiPropertyOptional({ example: true, default: true })
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
}
