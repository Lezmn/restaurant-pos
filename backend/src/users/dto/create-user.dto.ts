import { ApiProperty } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { Transform } from 'class-transformer';
import { IsEmail, IsEnum, IsNotEmpty, IsString, MaxLength, MinLength } from 'class-validator';

export class CreateUserDto {
  @ApiProperty({ example: 'สมชาย ใจดี' })
  // trim ก่อน validate — ไม่งั้นชื่อช่องว่างล้วนผ่าน IsNotEmpty
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name: string;

  @ApiProperty({ example: 'waiter2@restaurant.local' })
  // login เทียบอีเมลตรงตัว — เก็บเป็นตัวเล็กเสมอ กัน "Staff2" กับ "staff2" กลายเป็นคนละบัญชี
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value))
  @IsEmail()
  email: string;

  @ApiProperty({ example: 'StrongPass123!' })
  @IsString()
  @MinLength(8)
  // bcrypt ใช้แค่ 72 byte แรก — ยาวกว่านี้ส่วนเกินไม่มีผล กันผู้ใช้เข้าใจผิดว่ารหัสยาวปลอดภัยกว่า
  @MaxLength(72)
  password: string;

  @ApiProperty({ enum: Role, example: Role.STAFF })
  @IsEnum(Role)
  role: Role;
}
