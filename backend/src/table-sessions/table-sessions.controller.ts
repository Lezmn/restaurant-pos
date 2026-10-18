import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { Roles } from '../auth/decorators/roles.decorator';
import { CreateTableSessionDto } from './dto/create-table-session.dto';
import { FindTableSessionsQueryDto } from './dto/find-table-sessions-query.dto';
import { TableSessionsService } from './table-sessions.service';

@ApiTags('table-sessions')
@ApiBearerAuth()
@Controller('table-sessions')
export class TableSessionsController {
  constructor(private readonly tableSessionsService: TableSessionsService) {}

  @Post()
  @Roles(Role.ADMIN, Role.STAFF)
  @ApiOperation({ summary: 'เปิด QR session ให้โต๊ะ และนำ token ไปสร้าง QR code' })
  create(@Body() dto: CreateTableSessionDto) {
    return this.tableSessionsService.create(dto);
  }

  @Get()
  @Roles(Role.ADMIN, Role.STAFF)
  @ApiOperation({ summary: 'ดึงรายการ QR sessions ทั้งหมด (filter ตามสถานะได้)' })
  findAll(@Query() query: FindTableSessionsQueryDto) {
    return this.tableSessionsService.findAll(query.status);
  }

  @Get(':id')
  @Roles(Role.ADMIN, Role.STAFF)
  @ApiOperation({ summary: 'ดึง QR session ตาม id' })
  findOne(@Param('id') id: string) {
    return this.tableSessionsService.findOne(id);
  }

  @Patch(':id/close')
  @Roles(Role.ADMIN, Role.STAFF)
  @ApiOperation({ summary: 'ปิด QR session หลังจ่ายเงินครบแล้ว' })
  close(@Param('id') id: string) {
    return this.tableSessionsService.close(id);
  }
}
