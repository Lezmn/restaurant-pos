import { ApiPropertyOptional } from '@nestjs/swagger';
import { TableStatus } from '@prisma/client';
import { IsEnum, IsOptional } from 'class-validator';

export class FindTablesQueryDto {
  @ApiPropertyOptional({
    enum: TableStatus,
    description: 'กรองโต๊ะตามสถานะ ถ้าไม่ส่งจะดึงทุกโต๊ะ',
  })
  @IsOptional()
  @IsEnum(TableStatus)
  status?: TableStatus;
}
