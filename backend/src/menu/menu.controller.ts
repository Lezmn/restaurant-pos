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
import { ApiBearerAuth, ApiTags, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { Roles } from '../auth/decorators/roles.decorator';
import { MenuService } from './menu.service';
import { CreateMenuItemDto } from './dto/create-menu-item.dto';
import { UpdateMenuItemDto } from './dto/update-menu-item.dto';
import { CreateMenuOptionDto } from './dto/create-menu-option.dto';
import { UpdateMenuOptionDto } from './dto/update-menu-option.dto';

@ApiTags('menu')
@ApiBearerAuth()
@Controller('menu')
export class MenuController {
  constructor(private readonly menuService: MenuService) {}

  @Post()
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'เพิ่มเมนูใหม่' })
  create(@Body() dto: CreateMenuItemDto) {
    return this.menuService.create(dto);
  }

  @Get()
  @ApiOperation({ summary: 'ดึงรายการเมนูทั้งหมด (filter ตาม category ได้)' })
  @ApiQuery({
    name: 'categoryId',
    required: false,
    description: 'กรองเมนูตาม category id ถ้าไม่ส่งจะดึงทุกหมวด',
  })
  @ApiQuery({
    name: 'onlyAvailable',
    required: false,
    description: 'ส่ง true ถ้าต้องการเฉพาะเมนูที่พร้อมขาย',
    example: 'true',
  })
  findAll(
    @Query('categoryId') categoryId?: string,
    @Query('onlyAvailable') onlyAvailable?: string,
  ) {
    return this.menuService.findAll({
      categoryId,
      onlyAvailable: onlyAvailable === 'true',
    });
  }

  @Get(':id')
  @ApiOperation({ summary: 'ดึงเมนูตาม id' })
  findOne(@Param('id') id: string) {
    return this.menuService.findOne(id);
  }

  @Patch(':id')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'แก้ไขเมนู' })
  update(@Param('id') id: string, @Body() dto: UpdateMenuItemDto) {
    return this.menuService.update(id, dto);
  }

  @Delete(':id')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'ลบเมนู' })
  remove(@Param('id') id: string) {
    return this.menuService.remove(id);
  }

  @Post(':id/options')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'เพิ่มตัวเลือกให้เมนู เช่น หมู หรือ ไข่ดาว' })
  createOption(@Param('id') id: string, @Body() dto: CreateMenuOptionDto) {
    return this.menuService.createOption(id, dto);
  }

  @Patch(':id/options/:optionId')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'แก้ไขตัวเลือกของเมนู' })
  updateOption(
    @Param('id') id: string,
    @Param('optionId') optionId: string,
    @Body() dto: UpdateMenuOptionDto,
  ) {
    return this.menuService.updateOption(id, optionId, dto);
  }

  @Delete(':id/options/:optionId')
  @Roles(Role.ADMIN)
  @ApiOperation({
    summary: 'ลบตัวเลือกของเมนู (ลบไม่ได้ถ้าเคยถูกสั่งไปแล้ว ให้ปิดขายแทน)',
  })
  removeOption(@Param('id') id: string, @Param('optionId') optionId: string) {
    return this.menuService.removeOption(id, optionId);
  }
}
