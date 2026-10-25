import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { Roles } from '../auth/decorators/roles.decorator';
import { AuditService } from './audit.service';
import { FindAuditLogsQueryDto } from './dto/find-audit-logs-query.dto';

@ApiTags('audit-logs')
@ApiBearerAuth()
@Roles(Role.ADMIN)
@Controller('audit-logs')
export class AuditController {
  constructor(private readonly audit: AuditService) {}

  @Get()
  @ApiOperation({
    summary: 'ประวัติการทำรายการสำคัญ (ลดราคา/ยกเลิกบิล/ลบรายการ/เงินออก) ล่าสุดก่อน — บัญชีไหน เครื่องไหน เวลาไหน',
  })
  findAll(@Query() query: FindAuditLogsQueryDto) {
    return this.audit.findAll(query);
  }

  @Get('devices')
  @ApiOperation({ summary: 'เครื่องที่เคยมีประวัติ ไว้ทำตัวกรอง' })
  findDevices() {
    return this.audit.findDevices();
  }
}
