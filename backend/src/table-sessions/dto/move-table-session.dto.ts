import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

export class MoveTableSessionDto {
  @ApiProperty({ example: 'table-uuid', description: 'โต๊ะปลายทาง (ต้องว่างอยู่)' })
  @IsUUID()
  tableId: string;
}
