import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEmail, IsString, MinLength } from 'class-validator';

export class LoginDto {
  @ApiProperty({ example: 'admin@restaurant.local' })
  // อีเมลเก็บเป็นตัวเล็กเสมอ (users DTO) — พิมพ์ "Admin" บนแท็บเล็ตที่ขึ้นตัวใหญ่ให้เองก็ต้องเข้าได้
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value))
  @IsEmail()
  email: string;

  @ApiProperty({ example: 'your-password' })
  @IsString()
  @MinLength(8)
  password: string;
}
