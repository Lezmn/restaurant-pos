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

  @Post()
  @Roles(Role.ADMIN, Role.STAFF)
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
  @ApiOperation({ summary: 'ลบการปิดยอด เพื่อให้นับใหม่' })
  remove(@Param('id') id: string) {
    return this.cashClosesService.remove(id);
  }
}
