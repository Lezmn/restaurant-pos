import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsISO8601, IsOptional, IsUUID } from 'class-validator';

export class CreateTableSessionDto {
  @ApiProperty({ example: 'table-uuid' })
  @IsUUID()
  tableId: string;

  @ApiPropertyOptional({
    example: '2026-08-27T15:00:00.000Z',
    description:
      'เวลาหมดอายุของ QR session ถ้าไม่ส่งมาระบบจะตั้งให้อัตโนมัติ 3 ชั่วโมงหลังเปิด session',
  })
  @IsOptional()
  @IsISO8601()
  expiresAt?: string;
}
