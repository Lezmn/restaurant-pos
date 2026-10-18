import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
} from 'class-validator';
import { DATE_KEY_PATTERN } from './cash-close-date-query.dto';

export class CreateCashCloseDto {
  @ApiPropertyOptional({
    example: '2026-10-16',
    description: 'วันทำการที่ปิดยอด (YYYY-MM-DD) ไม่ส่ง = วันนี้',
  })
  @IsOptional()
  @Matches(DATE_KEY_PATTERN, { message: 'date ต้องอยู่ในรูปแบบ YYYY-MM-DD' })
  date?: string;

  @ApiProperty({ example: 1000, description: 'เงินทอนที่ใส่ลิ้นชักไว้ตอนเปิดร้าน' })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  openingFloat: number;

  @ApiProperty({ example: 5320, description: 'เงินสดที่นับได้จริงในลิ้นชัก (รวมเงินทอนตั้งต้น)' })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  countedCash: number;

  @ApiPropertyOptional({ example: 'ขาด 20 บาท น่าจะทอนผิดโต๊ะ 5' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}
