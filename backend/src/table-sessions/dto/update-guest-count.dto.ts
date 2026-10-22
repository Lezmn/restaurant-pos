import { ApiProperty } from '@nestjs/swagger';
import { IsInt, Max, Min } from 'class-validator';

export class UpdateGuestCountDto {
  @ApiProperty({ example: 4, description: 'จำนวนลูกค้าของโต๊ะนี้' })
  @IsInt()
  @Min(1)
  @Max(99)
  guestCount: number;
}
