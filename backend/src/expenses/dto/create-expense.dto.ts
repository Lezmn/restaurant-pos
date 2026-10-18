import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ExpenseCategory } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsISO8601,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';

export class CreateExpenseDto {
  @ApiProperty({ example: 'ค่าวัตถุดิบตลาดสด' })
  @IsString()
  @IsNotEmpty()
  title: string;

  @ApiProperty({ example: 1250.5 })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  amount: number;

  @ApiProperty({ enum: ExpenseCategory, example: ExpenseCategory.INGREDIENTS })
  @IsEnum(ExpenseCategory)
  category: ExpenseCategory;

  @ApiPropertyOptional({ example: 'ซื้อหมู ไก่ ผัก' })
  @IsOptional()
  @IsString()
  note?: string;

  @ApiPropertyOptional({
    example: '2026-09-04T09:00:00.000Z',
    description: 'วันที่จ่ายจริง ถ้าไม่ส่งมาจะใช้เวลาปัจจุบัน',
  })
  @IsOptional()
  @IsISO8601()
  spentAt?: string;

  @ApiPropertyOptional({
    example: false,
    description: 'หยิบเงินสดจากลิ้นชักไปจ่าย — นับเป็นเงินออกตอนปิดยอดวัน',
  })
  @IsOptional()
  @IsBoolean()
  paidFromDrawer?: boolean;
}
