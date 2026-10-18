import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class VoidPaymentDto {
  // บังคับใส่ทุกครั้ง — ยกเลิกบิลแล้วเงินหายจากยอดขาย เจ้าของต้องไล่ดูย้อนหลังได้ว่าเพราะอะไร
  @ApiProperty({ example: 'กดจ่ายผิดโต๊ะ' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @IsNotEmpty({ message: 'ต้องระบุเหตุผลที่ยกเลิกบิล' })
  @MaxLength(200)
  reason: string;
}
