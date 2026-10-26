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
import { Audit } from '../audit/audit.decorator';
import { loadOrder, loadOrderItem } from '../audit/audit-loaders';
import { OrdersService } from './orders.service';
import { CreateOrderDto } from './dto/create-order.dto';
import { CreateTakeawayOrderDto } from './dto/create-takeaway-order.dto';
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
  // รายการราคาเปิด = พนักงานตั้งราคาเอง — เก็บประวัติทุกครั้ง (ไม่มี = ไม่เก็บ)
  @Audit(({ body }) => (Array.isArray(body.customItems) && body.customItems.length > 0 ? 'ORDER_CUSTOM_ITEM' : null), {
    details: ({ body, result }) => ({
      customItems: body.customItems,
      tableSessionId: (result as { tableSessionId?: string } | undefined)?.tableSessionId ?? null,
    }),
    targetId: ({ result }) => (result as { id?: string } | undefined)?.id,
  })
  @ApiOperation({ summary: 'สร้างออเดอร์ใหม่ (ผูกกับโต๊ะ + รายการเมนู)' })
  create(@Body() dto: CreateOrderDto) {
    return this.ordersService.create(dto);
  }

  @Post('takeaway')
  @Roles(Role.ADMIN, Role.STAFF)
  // รายการราคาเปิด = พนักงานตั้งราคาเอง — เก็บประวัติทุกครั้ง (ไม่มี = ไม่เก็บ)
  @Audit(({ body }) => (Array.isArray(body.customItems) && body.customItems.length > 0 ? 'ORDER_CUSTOM_ITEM' : null), {
    details: ({ body, result }) => ({
      customItems: body.customItems,
      tableSessionId: (result as { tableSessionId?: string } | undefined)?.tableSessionId ?? null,
    }),
    targetId: ({ result }) => (result as { id?: string } | undefined)?.id,
  })
  @ApiOperation({ summary: 'สั่งกลับบ้าน (หน้า POS) — เปิดบิลกลับบ้านใบใหม่พร้อมออเดอร์แรก ได้เลขคิวของวัน' })
  createTakeaway(@Body() dto: CreateTakeawayOrderDto) {
    return this.ordersService.createTakeaway(dto);
  }

  @Get()
  @ApiOperation({
    summary:
      'ดึงรายการออเดอร์ — ไม่ส่ง filter = เฉพาะโต๊ะที่เปิดอยู่ ออเดอร์ที่ยังไม่จบ และของวันนี้',
  })
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
  // เปลี่ยนสถานะปกติไม่ต้องเก็บ — เก็บเฉพาะยกเลิก (เงินหายจากบิล)
  @Audit(({ body }) => (body.status === 'CANCELLED' ? 'ORDER_CANCEL' : null), {
    before: loadOrder,
    details: ({ before }) => {
      const order = before as Awaited<ReturnType<typeof loadOrder>>;
      return {
        tableNumber: order?.table.number ?? null,
        previousStatus: order?.status ?? null,
        items: order?.items.map((i) => ({ name: i.customName ?? i.menuItem?.name ?? null, quantity: i.quantity, unitPrice: i.unitPrice })) ?? [],
      };
    },
  })
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
  @Audit('ORDER_ITEM_REMOVE', {
    before: loadOrderItem,
    details: ({ before }) => {
      const item = before as Awaited<ReturnType<typeof loadOrderItem>>;
      return {
        tableNumber: item?.order.table.number ?? null,
        orderStatus: item?.order.status ?? null,
        name: item?.customName ?? item?.menuItem?.name ?? null,
        options: item?.selectedOptions.map((o) => o.name) ?? [],
        quantity: item?.quantity ?? null,
        unitPrice: item?.unitPrice ?? null,
        note: item?.note ?? null,
      };
    },
  })
  @ApiOperation({ summary: 'ลบรายการเมนูออกจากออเดอร์' })
  removeItem(@Param('id') id: string, @Param('itemId') itemId: string) {
    return this.ordersService.removeItem(id, itemId);
  }
}
