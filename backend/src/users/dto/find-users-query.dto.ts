import { ApiPropertyOptional } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { IsEnum, IsOptional } from 'class-validator';

export class FindUsersQueryDto {
  @ApiPropertyOptional({
    enum: Role,
    description: 'กรองพนักงานตาม role ถ้าไม่ส่งจะดึงทั้งหมด',
  })
  @IsOptional()
  @IsEnum(Role)
  role?: Role;
}
