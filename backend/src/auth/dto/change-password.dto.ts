import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength, MinLength } from 'class-validator';

export class ChangePasswordDto {
  @ApiProperty({ description: 'รหัสผ่านปัจจุบัน' })
  @IsString()
  currentPassword: string;

  @ApiProperty({ description: 'รหัสผ่านใหม่ อย่างน้อย 8 ตัวอักษร' })
  @IsString()
  @MinLength(8)
  // เพดานเดียวกับ CreateUserDto — bcrypt ใช้แค่ 72 byte แรก ส่วนเกินไม่มีผล
  @MaxLength(72)
  newPassword: string;
}
