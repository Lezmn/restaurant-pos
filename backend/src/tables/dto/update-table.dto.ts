import { ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { TableStatus } from '@prisma/client';
import { IsBoolean, IsEnum, IsOptional } from 'class-validator';
import { CreateTableDto } from './create-table.dto';

export class UpdateTableDto extends PartialType(CreateTableDto) {
  @ApiPropertyOptional({ enum: TableStatus, example: TableStatus.AVAILABLE })
  @IsOptional()
  @IsEnum(TableStatus)
  status?: TableStatus;

  @ApiPropertyOptional({
    example: false,
    description: 'false = ปิดใช้งาน (ยกโต๊ะออก) ใช้แทนการลบเมื่อโต๊ะมีประวัติการขาย — ต้องไม่มีลูกค้านั่งอยู่',
  })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
