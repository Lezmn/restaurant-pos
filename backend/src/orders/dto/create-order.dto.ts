import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsOptional,
  IsUUID,
  ValidateNested,
} from 'class-validator';
import { OrderItemInputDto } from './order-item-input.dto';

export class CreateOrderDto {
  @ApiProperty({ example: 'table-uuid' })
  @IsUUID()
  tableId: string;

  // session ที่พนักงานเห็นตอนเปิดหน้ารับออเดอร์ — ถ้าบิลรอบนั้นปิดไปแล้วต้องปฏิเสธ
  // ไม่งั้นออเดอร์จะไปเข้าบิลรอบใหม่ของโต๊ะ (คนละกลุ่มลูกค้า)
  @ApiPropertyOptional({ example: 'table-session-uuid' })
  @IsOptional()
  @IsUUID()
  tableSessionId?: string;

  @ApiProperty({ type: [OrderItemInputDto] })
  @IsArray()
  @ArrayMinSize(1)
  // ออเดอร์เดียวไม่ควรเกินนี้ (คนละเมนู/คนละตัวเลือก) — กัน payload ใหญ่ผิดปกติ
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => OrderItemInputDto)
  items: OrderItemInputDto[];
}
