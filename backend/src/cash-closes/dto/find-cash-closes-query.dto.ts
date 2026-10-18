import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, Matches } from 'class-validator';

export class FindCashClosesQueryDto {
  @ApiPropertyOptional({
    example: '2026-10',
    description: 'กรองเฉพาะเดือนนี้ (YYYY-MM) ไม่ส่ง = ทั้งหมด',
  })
  @IsOptional()
  @Matches(/^\d{4}-(0[1-9]|1[0-2])$/, { message: 'month ต้องอยู่ในรูปแบบ YYYY-MM' })
  month?: string;
}
