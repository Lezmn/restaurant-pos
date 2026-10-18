import { ApiProperty } from '@nestjs/swagger';
import { IsString } from 'class-validator';

export class CallStaffDto {
  @ApiProperty({ example: 'qr-session-token' })
  @IsString()
  sessionToken: string;
}
