import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class ConfirmSlipDto {
  // ยืนยันรับเงินโดยไม่ผ่าน SlipOK — ต้องมีเหตุผลเสมอ เจ้าของต้องไล่ดูย้อนหลังได้
  @ApiProperty({ example: 'เช็คยอดเข้าในแอปธนาคารแล้ว ฿350 เวลา 19:42' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @IsNotEmpty({ message: 'ต้องระบุเหตุผลที่ยืนยันเอง' })
  @MaxLength(200)
  reason: string;
}
