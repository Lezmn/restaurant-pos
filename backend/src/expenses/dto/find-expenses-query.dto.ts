import { ApiPropertyOptional } from '@nestjs/swagger';
import { ExpenseCategory } from '@prisma/client';
import { IsEnum, IsISO8601, IsOptional, Matches } from 'class-validator';

export class FindExpensesQueryDto {
  @ApiPropertyOptional({ enum: ExpenseCategory })
  @IsOptional()
  @IsEnum(ExpenseCategory)
  category?: ExpenseCategory;

  @ApiPropertyOptional({
    example: '2026-09',
    description: 'กรองเฉพาะเดือนนี้ (YYYY-MM) — ใช้แทน from/to ได้',
  })
  @IsOptional()
  @Matches(/^\d{4}-(0[1-9]|1[0-2])$/, { message: 'month ต้องอยู่ในรูปแบบ YYYY-MM' })
  month?: string;

  @ApiPropertyOptional({ example: '2026-09-01T00:00:00.000Z' })
  @IsOptional()
  @IsISO8601()
  from?: string;

  @ApiPropertyOptional({ example: '2026-09-30T23:59:59.000Z' })
  @IsOptional()
  @IsISO8601()
  to?: string;
}
