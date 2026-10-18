import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsOptional, Min } from 'class-validator';

export class CreateTableDto {
  @ApiProperty({ example: 1, description: 'เลขโต๊ะ ต้องไม่ซ้ำกัน' })
  @IsInt()
  @Min(1)
  number: number;

  @ApiPropertyOptional({ example: 4, default: 4, description: 'จำนวนที่นั่ง' })
  @IsOptional()
  @IsInt()
  @Min(1)
  seats?: number;
}
