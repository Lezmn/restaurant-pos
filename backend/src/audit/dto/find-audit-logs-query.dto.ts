import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsDateString, IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { AUDIT_ACTIONS, AuditAction } from '../audit.decorator';

export class FindAuditLogsQueryDto {
  @ApiPropertyOptional({ example: '2026-10-26T00:00:00.000Z' })
  @IsOptional()
  @IsDateString()
  from?: string;

  @ApiPropertyOptional({ example: '2026-10-27T00:00:00.000Z' })
  @IsOptional()
  @IsDateString()
  to?: string;

  @ApiPropertyOptional({
    description: 'โหลดหน้าถัดไป — ส่ง createdAt ของแถวสุดท้ายที่ได้มา',
  })
  @IsOptional()
  @IsDateString()
  before?: string;

  @ApiPropertyOptional({ enum: AUDIT_ACTIONS })
  @IsOptional()
  @IsIn(AUDIT_ACTIONS)
  action?: AuditAction;

  @ApiPropertyOptional({ description: 'กรองเฉพาะเครื่องนี้' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  deviceId?: string;

  @ApiPropertyOptional({ example: 100, description: 'สูงสุด 200' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number;
}
