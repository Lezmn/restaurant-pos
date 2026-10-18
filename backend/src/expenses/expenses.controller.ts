import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { AuthenticatedUser } from '../auth/jwt.strategy';
import { Roles } from '../auth/decorators/roles.decorator';
import { CreateDrawerExpenseDto } from './dto/create-drawer-expense.dto';
import { CreateExpenseDto } from './dto/create-expense.dto';
import { FindExpensesQueryDto } from './dto/find-expenses-query.dto';
import { UpdateExpenseDto } from './dto/update-expense.dto';
import { ExpensesService } from './expenses.service';

@ApiTags('expenses')
@ApiBearerAuth()
@Roles(Role.ADMIN)
@Controller('expenses')
export class ExpensesController {
  constructor(private readonly expensesService: ExpensesService) {}

  @Post()
  @ApiOperation({ summary: 'บันทึกรายจ่ายของร้าน' })
  create(
    @Body() dto: CreateExpenseDto,
    @Req() request: { user: AuthenticatedUser },
  ) {
    return this.expensesService.create(dto, request.user);
  }

  @Post('drawer')
  @Roles(Role.ADMIN, Role.STAFF)
  @ApiOperation({ summary: 'พนักงานบันทึกเงินสดที่หยิบจากลิ้นชักไปจ่าย (แก้/ลบได้เฉพาะผู้ดูแล)' })
  createFromDrawer(
    @Body() dto: CreateDrawerExpenseDto,
    @Req() request: { user: AuthenticatedUser },
  ) {
    return this.expensesService.createFromDrawer(dto, request.user);
  }

  @Get()
  @ApiOperation({ summary: 'ดึงรายจ่าย (filter ตามหมวด/เดือน/ช่วงวันที่ได้)' })
  findAll(@Query() query: FindExpensesQueryDto) {
    return this.expensesService.findAll(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'ดึงรายจ่ายตาม id' })
  findOne(@Param('id') id: string) {
    return this.expensesService.findOne(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'แก้ไขรายจ่าย' })
  update(@Param('id') id: string, @Body() dto: UpdateExpenseDto) {
    return this.expensesService.update(id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'ลบรายจ่าย' })
  remove(@Param('id') id: string) {
    return this.expensesService.remove(id);
  }
}
