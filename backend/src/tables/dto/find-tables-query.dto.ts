import { ApiPropertyOptional } from '@nestjs/swagger';
import { TableStatus } from '@prisma/client';
import { Transform } from 'class-transformer';
import { IsBoolean, IsEnum, IsOptional } from 'class-validator';

export class FindTablesQueryDto {
  @ApiPropertyOptional({
    enum: TableStatus,
    description: 'กรองโต๊ะตามสถานะ ถ้าไม่ส่งจะดึงทุกโต๊ะ',
  })
  @IsOptional()
  @IsEnum(TableStatus)
  status?: TableStatus;

  @ApiPropertyOptional({
    example: true,
    description: 'true = รวมโต๊ะที่ปิดใช้งาน (หน้าจัดการโต๊ะของ ADMIN) — ไม่ส่ง = เฉพาะโต๊ะที่ใช้งานอยู่',
  })
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  includeInactive?: boolean;
}
