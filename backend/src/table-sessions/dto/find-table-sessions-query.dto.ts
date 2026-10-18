import { ApiPropertyOptional } from '@nestjs/swagger';
import { TableSessionStatus } from '@prisma/client';
import { IsEnum, IsOptional } from 'class-validator';

export class FindTableSessionsQueryDto {
  @ApiPropertyOptional({
    enum: TableSessionStatus,
    description: 'กรองตามสถานะ session ถ้าไม่ส่งจะดึงทั้งหมด',
  })
  @IsOptional()
  @IsEnum(TableSessionStatus)
  status?: TableSessionStatus;
}
