import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class AttachSlipDto {
  @ApiProperty({
    example: '0041000600000101030060217...',
    description: 'ข้อความใน QR มุมขวาล่างของสลิป (จากเครื่องสแกน/อ่านจากรูป)',
  })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @IsNotEmpty({ message: 'ต้องสแกนสลิปก่อน' })
  @MaxLength(500)
  slipPayload: string;
}
