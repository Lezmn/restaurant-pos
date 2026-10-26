import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsOptional, IsString, Length, Matches } from 'class-validator';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

/** ปลายทาง LINE: User ID (U...), Group ID (C...) หรือ Room ID (R...) + hex 32 ตัว */
const LINE_TARGET = /^[UCR][0-9a-f]{32}$/;
const LINE_TARGET_MESSAGE = 'User ID ต้องขึ้นต้นด้วย U ตามด้วยตัวอักษร/ตัวเลข 32 ตัว (ก๊อปจาก "Your user ID")';

export class UpdateLineSettingsDto {
  @ApiProperty({ description: 'เปิด/ปิดการส่งสรุปยอดเข้า LINE' })
  @IsBoolean()
  enabled: boolean;

  @ApiProperty({ example: 'U0123456789abcdef0123456789abcdef' })
  @IsString()
  @Transform(trim)
  @Matches(LINE_TARGET, { message: LINE_TARGET_MESSAGE })
  to: string;

  @ApiPropertyOptional({ description: 'Channel access token (long-lived) — ไม่ส่ง = ใช้ตัวเดิม' })
  @IsOptional()
  @IsString()
  @Transform(trim)
  @Length(20, 1000, { message: 'Channel access token สั้น/ยาวผิดปกติ — ก๊อปมาทั้งหมดหรือยัง' })
  token?: string;
}

/** ทดสอบส่ง — ไม่ส่งค่าไหน = ใช้ค่าที่บันทึกไว้ (ทดสอบก่อนกดบันทึกได้) */
export class TestLineSettingsDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Transform(trim)
  @Matches(LINE_TARGET, { message: LINE_TARGET_MESSAGE })
  to?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Transform(trim)
  @Length(20, 1000, { message: 'Channel access token สั้น/ยาวผิดปกติ — ก๊อปมาทั้งหมดหรือยัง' })
  token?: string;
}
