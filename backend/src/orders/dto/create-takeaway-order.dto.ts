import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { OrderItemInputDto } from './order-item-input.dto';

/** สั่งกลับบ้านจากหน้า POS — เปิดบิลกลับบ้านใบใหม่พร้อมออเดอร์แรกในครั้งเดียว */
export class CreateTakeawayOrderDto {
  @ApiPropertyOptional({ example: 'คุณเอ 081-234-5678', description: 'ชื่อ/เบอร์ลูกค้า ไว้เรียกตอนของเสร็จ' })
  @IsOptional()
  @IsString()
  @MaxLength(60)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  customerName?: string;

  @ApiProperty({ type: [OrderItemInputDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => OrderItemInputDto)
  items: OrderItemInputDto[];
}
