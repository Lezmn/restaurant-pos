import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ExpenseCategory } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';

/**
 * พนักงานหยิบเงินสดจากลิ้นชักไปจ่าย — กรอกน้อยที่สุดเพื่อให้บันทึกทันทีตอนหยิบ
 * เวลาเป็นตอนบันทึกเสมอ (ไม่ให้ย้อนวัน) และ paidFromDrawer = true เสมอ
 */
export class CreateDrawerExpenseDto {
  @ApiProperty({ example: 'น้ำแข็ง 2 ถุง' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  title: string;

  @ApiProperty({ example: 40 })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  amount: number;

  @ApiPropertyOptional({
    enum: ExpenseCategory,
    example: ExpenseCategory.INGREDIENTS,
    description: 'ไม่ส่ง = วัตถุดิบ',
  })
  @IsOptional()
  @IsEnum(ExpenseCategory)
  category?: ExpenseCategory;
}
