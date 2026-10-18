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
import { OrdersService } from './orders.service';
import { CreateOrderDto } from './dto/create-order.dto';
import { FindOrdersQueryDto } from './dto/find-orders-query.dto';
import { OrderItemInputDto } from './dto/order-item-input.dto';
import { UpdateOrderStatusDto } from './dto/update-order-status.dto';

@ApiTags('orders')
@ApiBearerAuth()
@Controller('orders')
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Post()
  @Roles(Role.ADMIN, Role.STAFF)
  @ApiOperation({ summary: 'สร้างออเดอร์ใหม่ (ผูกกับโต๊ะ + รายการเมนู)' })
  create(@Body() dto: CreateOrderDto) {
    return this.ordersService.create(dto);
  }

  @Get()
  @ApiOperation({ summary: 'ดึงรายการออเดอร์ทั้งหมด (filter ได้)' })
  findAll(@Query() query: FindOrdersQueryDto) {
    return this.ordersService.findAll(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'ดึงออเดอร์ตาม id' })
  findOne(@Param('id') id: string) {
    return this.ordersService.findOne(id);
  }

  @Get(':id/total')
  @ApiOperation({ summary: 'คำนวณยอดรวมของออเดอร์' })
  getTotal(@Param('id') id: string) {
    return this.ordersService.getTotal(id);
  }

  @Patch(':id/status')
  @Roles(Role.ADMIN, Role.KITCHEN)
  @ApiOperation({ summary: 'เปลี่ยนสถานะออเดอร์ (pending → preparing → served → paid)' })
  updateStatus(@Param('id') id: string, @Body() dto: UpdateOrderStatusDto) {
    return this.ordersService.updateStatus(id, dto.status);
  }

  @Patch(':id/clear')
  @Roles(Role.ADMIN, Role.KITCHEN)
  @ApiOperation({
    summary: 'เคลียร์ออเดอร์ที่เสิร์ฟแล้วออกจากบอร์ดครัว (ยังอยู่ในบิล)',
  })
  markCleared(@Param('id') id: string) {
    return this.ordersService.markCleared(id);
  }

  @Post(':id/items')
  @Roles(Role.ADMIN, Role.STAFF)
  @ApiOperation({ summary: 'เพิ่มเมนูเข้าไปในออเดอร์ที่ยังเปิดอยู่' })
  addItem(@Param('id') id: string, @Body() dto: OrderItemInputDto) {
    return this.ordersService.addItem(id, dto);
  }

  @Delete(':id/items/:itemId')
  @Roles(Role.ADMIN, Role.STAFF)
  @ApiOperation({ summary: 'ลบรายการเมนูออกจากออเดอร์' })
  removeItem(@Param('id') id: string, @Param('itemId') itemId: string) {
    return this.ordersService.removeItem(id, itemId);
  }
}
