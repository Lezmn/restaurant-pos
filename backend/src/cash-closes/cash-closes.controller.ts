import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { AuthenticatedUser } from '../auth/jwt.strategy';
import { Roles } from '../auth/decorators/roles.decorator';
import { Audit } from '../audit/audit.decorator';
import { loadCashClose } from '../audit/audit-loaders';
import { CashClosesService } from './cash-closes.service';
import { CashCloseDateQueryDto } from './dto/cash-close-date-query.dto';
import { CreateCashCloseDto } from './dto/create-cash-close.dto';
import { FindCashClosesQueryDto } from './dto/find-cash-closes-query.dto';

@ApiTags('cash-closes')
@ApiBearerAuth()
@Controller('cash-closes')
export class CashClosesController {
  constructor(private readonly cashClosesService: CashClosesService) {}

  @Get('preview')
  @Roles(Role.ADMIN, Role.STAFF)
  @ApiOperation({ summary: 'ยอดเงินสด/PromptPay ของวัน ก่อนนับเงินปิดยอด' })
  preview(@Query() query: CashCloseDateQueryDto) {
    return this.cashClosesService.preview(query.date);
  }

  // เจ้าของร้านเท่านั้น — ปุ่มปิดยอดย้ายไปหน้า "ปิดยอดเงินสด" ของ ADMIN แล้ว (preview ยังให้ STAFF ดูยอดลิ้นชักได้)
  @Post()
  @Roles(Role.ADMIN)
  @Audit('CASH_CLOSE_CREATE', {
    targetId: ({ result }) => (result as { id: string }).id,
    details: ({ result }) => {
      const close = result as Record<string, unknown>;
      return {
        date: close.date,
        openingFloat: close.openingFloat,
        expectedCash: close.expectedCash,
        countedCash: close.countedCash,
        difference: close.difference,
        note: close.note ?? null,
      };
    },
  })
  @ApiOperation({ summary: 'ปิดยอดเงินสดประจำวัน (วันละครั้ง)' })
  create(
    @Body() dto: CreateCashCloseDto,
    @Req() request: { user: AuthenticatedUser },
  ) {
    return this.cashClosesService.create(dto, request.user);
  }

  @Get()
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'ประวัติการปิดยอด (filter ตามเดือนได้)' })
  findAll(@Query() query: FindCashClosesQueryDto) {
    return this.cashClosesService.findAll(query);
  }

  @Get(':id')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'ดูการปิดยอด พร้อมเช็คว่ายอดเปลี่ยนหลังปิดหรือไม่' })
  findOne(@Param('id') id: string) {
    return this.cashClosesService.findOne(id);
  }

  @Delete(':id')
  @Roles(Role.ADMIN)
  @Audit('CASH_CLOSE_DELETE', { before: loadCashClose, details: ({ before }) => before as Record<string, unknown> })
  @ApiOperation({ summary: 'ลบการปิดยอด เพื่อให้นับใหม่' })
  remove(@Param('id') id: string) {
    return this.cashClosesService.remove(id);
  }
}
