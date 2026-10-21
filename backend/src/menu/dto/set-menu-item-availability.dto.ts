import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean } from 'class-validator';

/** ครัวเปิด/ปิดขายเมนูได้ แต่แก้ชื่อ/ราคา/รูปไม่ได้ — จึงแยก DTO ไม่ใช้ UpdateMenuItemDto */
export class SetMenuItemAvailabilityDto {
  @ApiProperty({ example: false })
  @IsBoolean()
  isAvailable: boolean;
}
