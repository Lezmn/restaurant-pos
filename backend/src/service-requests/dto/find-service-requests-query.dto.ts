import { ApiPropertyOptional } from '@nestjs/swagger';
import { ServiceRequestStatus, ServiceRequestType } from '@prisma/client';
import { IsEnum, IsOptional, IsUUID } from 'class-validator';

export class FindServiceRequestsQueryDto {
  @ApiPropertyOptional({
    enum: ServiceRequestStatus,
    example: ServiceRequestStatus.PENDING,
  })
  @IsOptional()
  @IsEnum(ServiceRequestStatus)
  status?: ServiceRequestStatus;

  @ApiPropertyOptional({
    enum: ServiceRequestType,
    example: ServiceRequestType.CALL_STAFF,
  })
  @IsOptional()
  @IsEnum(ServiceRequestType)
  type?: ServiceRequestType;

  @ApiPropertyOptional({ example: 'table-uuid' })
  @IsOptional()
  @IsUUID()
  tableId?: string;

  @ApiPropertyOptional({ example: 'table-session-uuid' })
  @IsOptional()
  @IsUUID()
  tableSessionId?: string;
}
