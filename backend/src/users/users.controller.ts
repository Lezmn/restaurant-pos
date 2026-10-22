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
import { CreateUserDto } from './dto/create-user.dto';
import { FindUsersQueryDto } from './dto/find-users-query.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UsersService } from './users.service';

@ApiTags('users')
@ApiBearerAuth()
@Roles(Role.ADMIN)
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Post()
  @ApiOperation({ summary: 'เพิ่มพนักงานใหม่' })
  create(@Body() dto: CreateUserDto) {
    return this.usersService.create(dto);
  }

  @Get()
  @ApiOperation({ summary: 'ดึงรายชื่อพนักงานทั้งหมด (filter ตาม role ได้)' })
  findAll(@Query() query: FindUsersQueryDto) {
    return this.usersService.findAll(query.role);
  }

  @Get(':id')
  @ApiOperation({ summary: 'ดึงข้อมูลพนักงานตาม id' })
  findOne(@Param('id') id: string) {
    return this.usersService.findOne(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'แก้ไขข้อมูลพนักงาน (ตั้งรหัสผ่านใหม่ / ปิดใช้งานได้ด้วย)' })
  update(
    @Param('id') id: string,
    @Body() dto: UpdateUserDto,
    @Req() request: { user: AuthenticatedUser },
  ) {
    return this.usersService.update(id, dto, request.user.id);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'ลบพนักงาน (ลบบัญชีตัวเองไม่ได้)' })
  remove(
    @Param('id') id: string,
    @Req() request: { user: AuthenticatedUser },
  ) {
    return this.usersService.remove(id, request.user.id);
  }
}
