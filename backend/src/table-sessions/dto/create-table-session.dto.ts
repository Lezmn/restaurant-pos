import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsISO8601, IsInt, IsOptional, IsUUID, Max, Min } from 'class-validator';

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

  @ApiPropertyOptional({ example: 4, description: 'จำนวนลูกค้า (ไม่ส่ง = ยังไม่ระบุ กดเลือกทีหลังได้)' })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(99)
  guestCount?: number;
}
