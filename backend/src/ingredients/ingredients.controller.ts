import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Param,
  Patch,
  Post,
  Req,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { Roles } from '../auth/decorators/roles.decorator';
import { AuthenticatedUser } from '../auth/jwt.strategy';
import { CreateIngredientDto } from './dto/create-ingredient.dto';
import { UpdateIngredientDto } from './dto/update-ingredient.dto';
import { IngredientsService } from './ingredients.service';

@ApiTags('ingredients')
@ApiBearerAuth()
@Controller('ingredients')
export class IngredientsController {
  constructor(private readonly ingredientsService: IngredientsService) {}

  @Post()
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'เพิ่มวัตถุดิบใหม่' })
  create(@Body() dto: CreateIngredientDto) {
    return this.ingredientsService.create(dto);
  }

  // ครัวต้องเห็นด้วยว่าอะไรหมด จึงไม่จำกัดเฉพาะ ADMIN
  @Get()
  @ApiOperation({ summary: 'ดึงวัตถุดิบทั้งหมด พร้อมจำนวนตัวเลือกเมนูที่ผูกอยู่' })
  findAll() {
    return this.ingredientsService.findAll();
  }

  @Get(':id')
  @ApiOperation({ summary: 'ดึงวัตถุดิบตาม id' })
  findOne(@Param('id') id: string) {
    return this.ingredientsService.findOne(id);
  }

  @Patch(':id')
  @Roles(Role.ADMIN, Role.KITCHEN)
  @ApiOperation({
    summary: 'แก้ชื่อ หรือเปิด/ปิดวัตถุดิบ (ปิดแล้วตัวเลือกที่ผูกไว้จะสั่งไม่ได้ทุกเมนู)',
  })
  update(
    @Param('id') id: string,
    @Body() dto: UpdateIngredientDto,
    @Req() request: { user: AuthenticatedUser },
  ) {
    // ครัวเปิด/ปิดของและตั้งยอดได้ แต่รูปเปลี่ยนได้เฉพาะ ADMIN (เหมือนรูปเมนู)
    if (dto.imageUrl !== undefined && request.user.role !== Role.ADMIN) {
      throw new ForbiddenException('เปลี่ยนรูปวัตถุดิบได้เฉพาะผู้ดูแล');
    }
    return this.ingredientsService.update(id, dto);
  }

  @Delete(':id')
  @Roles(Role.ADMIN)
  @ApiOperation({
    summary:
      'ลบวัตถุดิบ — ตัวเลือกเมนูที่ผูกอยู่: ยังไม่เคยถูกสั่งจะถูกลบ, เคยถูกสั่งแล้วจะถูกปิดขายและปลดวัตถุดิบออก',
  })
  remove(@Param('id') id: string) {
    return this.ingredientsService.remove(id);
  }
}
