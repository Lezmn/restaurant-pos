import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { Roles } from '../auth/decorators/roles.decorator';
import { ReportRangeQueryDto } from './dto/report-range-query.dto';
import { ReportsService } from './reports.service';

@ApiTags('reports')
@ApiBearerAuth()
@Roles(Role.ADMIN)
@Controller('reports')
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  @Get('dashboard')
  @ApiOperation({
    summary: 'สรุปยอดวันนี้ (ยอดขาย/รายจ่าย/กำไร, แยกตามวิธีจ่าย, สถานะโต๊ะ, เทรนด์ 7 วัน)',
  })
  getDashboard() {
    return this.reportsService.getDashboard();
  }

  @Get('income-expense')
  @ApiOperation({
    summary: 'รายรับ-รายจ่ายตามช่วงเวลา พร้อมกำไรสุทธิและรายการธุรกรรม (ไม่ระบุ = เดือนปัจจุบัน)',
  })
  getIncomeExpense(@Query() query: ReportRangeQueryDto) {
    return this.reportsService.getIncomeExpense(query);
  }
}
