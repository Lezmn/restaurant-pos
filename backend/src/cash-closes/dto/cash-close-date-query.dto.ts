import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, Matches } from 'class-validator';

export const DATE_KEY_PATTERN = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;

export class CashCloseDateQueryDto {
  @ApiPropertyOptional({
    example: '2026-10-16',
    description: 'วันทำการ (YYYY-MM-DD) ไม่ส่ง = วันนี้',
  })
  @IsOptional()
  @Matches(DATE_KEY_PATTERN, { message: 'date ต้องอยู่ในรูปแบบ YYYY-MM-DD' })
  date?: string;
}
