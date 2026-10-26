import { Controller, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { Roles } from '../auth/decorators/roles.decorator';
import { SystemStatusService } from './system-status.service';

@ApiTags('health')
@ApiBearerAuth()
@Roles(Role.ADMIN)
@Controller('system')
export class SystemStatusController {
  constructor(private readonly status: SystemStatusService) {}

  @Get('status')
  @ApiOperation({
    summary: 'สถานะระบบละเอียด: ฐานข้อมูล, สำรองล่าสุด, ส่งออกนอกเครื่อง, SlipOK, LINE (ADMIN)',
  })
  getStatus() {
    return this.status.getStatus();
  }
}
