import { ApiProperty } from '@nestjs/swagger';
import { IsString } from 'class-validator';

/**
 * ลูกค้าแจ้งว่าต้องการชำระเงิน — ไม่มีวิธีจ่าย แคชเชียร์เลือกเองตอนรับเงิน
 * (หน้าเก่าที่ยังส่ง paymentMethod มา ValidationPipe whitelist ตัดทิ้งให้ ไม่ error)
 */
export class CheckoutDto {
  @ApiProperty({ example: 'qr-session-token' })
  @IsString()
  sessionToken: string;
}
