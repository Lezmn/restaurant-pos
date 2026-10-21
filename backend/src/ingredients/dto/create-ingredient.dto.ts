import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';

export class CreateIngredientDto {
  @ApiProperty({ example: 'หมู' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name: string;

  @ApiPropertyOptional({ example: true, default: true })
  @IsOptional()
  @IsBoolean()
  isAvailable?: boolean;

  @ApiPropertyOptional({
    example: 30,
    nullable: true,
    description:
      'จำนวนคงเหลือ — null = ไม่นับสต็อก (ปิดด้วยมือ) · ตั้ง 0 = ปิดให้เอง · ตั้งมากกว่า 0 = เปิดให้เอง (ถ้าไม่ได้ส่ง isAvailable มา)',
  })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsInt()
  @Min(0)
  @Max(1_000_000)
  stockQty?: number | null;

  @ApiPropertyOptional({
    example: 5,
    nullable: true,
    description: 'เหลือเท่านี้หรือน้อยกว่าให้ขึ้นเตือน "ใกล้หมด" (null = ไม่เตือน)',
  })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsInt()
  @Min(0)
  @Max(1_000_000)
  lowStockAt?: number | null;
}
