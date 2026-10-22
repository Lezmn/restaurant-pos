import { ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { IsBoolean, IsOptional } from 'class-validator';
import { CreateUserDto } from './create-user.dto';

export class UpdateUserDto extends PartialType(CreateUserDto) {
  @ApiPropertyOptional({
    description: 'false = ปิดใช้งาน (login ไม่ได้ และ token ที่ถืออยู่ใช้ไม่ได้ทันที) ใช้แทนการลบ',
  })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
