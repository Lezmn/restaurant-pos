import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { Roles } from '../auth/decorators/roles.decorator';
import { TablesService } from './tables.service';
import { CreateTableDto } from './dto/create-table.dto';
import { FindTablesQueryDto } from './dto/find-tables-query.dto';
import { UpdateTableDto } from './dto/update-table.dto';

@ApiTags('tables')
@ApiBearerAuth()
@Controller('tables')
export class TablesController {
  constructor(private readonly tablesService: TablesService) {}

  @Post()
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'เพิ่มโต๊ะใหม่' })
  create(@Body() dto: CreateTableDto) {
    return this.tablesService.create(dto);
  }

  @Get()
  @ApiOperation({ summary: 'ดึงโต๊ะทั้งหมด (filter ตามสถานะได้ เช่น ?status=AVAILABLE)' })
  findAll(@Query() query: FindTablesQueryDto) {
    return this.tablesService.findAll(query.status);
  }

  @Get(':id')
  @ApiOperation({ summary: 'ดึงโต๊ะตาม id พร้อมออเดอร์ที่ยังเปิดอยู่ (ถ้ามี)' })
  findOne(@Param('id') id: string) {
    return this.tablesService.findOne(id);
  }

  @Patch(':id')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'แก้ไขโต๊ะ (เลขโต๊ะ, จำนวนที่นั่ง, หรือสถานะ)' })
  update(@Param('id') id: string, @Body() dto: UpdateTableDto) {
    return this.tablesService.update(id, dto);
  }

  @Delete(':id')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'ลบโต๊ะ (ลบไม่ได้ถ้ายังมีออเดอร์เปิดอยู่)' })
  remove(@Param('id') id: string) {
    return this.tablesService.remove(id);
  }
}
