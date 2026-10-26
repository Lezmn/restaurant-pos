import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsOptional,
  IsUUID,
  ValidateNested,
} from 'class-validator';
import { CustomItemInputDto } from './custom-item-input.dto';
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
  // ออเดอร์เดียวไม่ควรเกินนี้ (คนละเมนู/คนละตัวเลือก) — กัน payload ใหญ่ผิดปกติ
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => OrderItemInputDto)
  items: OrderItemInputDto[];

  @ApiPropertyOptional({
    type: [CustomItemInputDto],
    description: 'รายการราคาเปิด (พิมพ์ชื่อ/ราคาเอง) — ส่ง items ว่างได้ถ้ามีรายการนี้',
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => CustomItemInputDto)
  customItems?: CustomItemInputDto[];
}
