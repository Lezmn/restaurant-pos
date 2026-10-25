import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

export class MergeTableSessionDto {
  @ApiProperty({
    example: 'table-session-uuid',
    description: 'บิลของโต๊ะที่จะรวมเข้าไป — ออเดอร์ที่ยังไม่จ่ายของโต๊ะนี้จะย้ายไปอยู่บิลนั้น',
  })
  @IsUUID()
  targetSessionId: string;
}
