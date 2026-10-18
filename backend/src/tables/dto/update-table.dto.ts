import { ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { TableStatus } from '@prisma/client';
import { IsEnum, IsOptional } from 'class-validator';
import { CreateTableDto } from './create-table.dto';

export class UpdateTableDto extends PartialType(CreateTableDto) {
  @ApiPropertyOptional({ enum: TableStatus, example: TableStatus.AVAILABLE })
  @IsOptional()
  @IsEnum(TableStatus)
  status?: TableStatus;
}
