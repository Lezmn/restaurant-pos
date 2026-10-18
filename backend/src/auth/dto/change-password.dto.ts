import { ApiProperty } from '@nestjs/swagger';
import { IsString, MinLength } from 'class-validator';

export class ChangePasswordDto {
  @ApiProperty({ description: 'รหัสผ่านปัจจุบัน' })
  @IsString()
  currentPassword: string;

  @ApiProperty({ description: 'รหัสผ่านใหม่ อย่างน้อย 8 ตัวอักษร' })
  @IsString()
  @MinLength(8)
  newPassword: string;
}
