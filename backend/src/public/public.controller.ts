import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../auth/decorators/public.decorator';
import { CallStaffDto } from './dto/call-staff.dto';
import { CheckoutDto } from './dto/checkout.dto';
import { CreateCustomerOrderDto } from './dto/create-customer-order.dto';
import { PublicService } from './public.service';

@Public()
@ApiTags('public-customer')
@Controller('public')
export class PublicController {
  constructor(private readonly publicService: PublicService) {}

  @Get('menu')
  @ApiOperation({ summary: 'ลูกค้าดึงเมนูที่พร้อมขาย พร้อม category และ option' })
  getMenu() {
    return this.publicService.getMenu();
  }

  @Get('sessions/:token')
  @ApiOperation({ summary: 'ตรวจ QR session และดูข้อมูลโต๊ะ' })
  getSession(@Param('token') token: string) {
    return this.publicService.getSession(token);
  }

  @Get('sessions/:token/orders')
  @ApiOperation({ summary: 'ดูรายการออเดอร์ทั้งหมดใน QR session นี้' })
  getOrdersBySession(@Param('token') token: string) {
    return this.publicService.getOrdersBySession(token);
  }

  @Post('orders')
  @ApiOperation({ summary: 'ลูกค้าส่งออเดอร์จาก QR session' })
  createOrder(@Body() dto: CreateCustomerOrderDto) {
    return this.publicService.createOrder(dto);
  }

  @Get('orders/:id/status')
  @ApiOperation({ summary: 'ลูกค้าดูสถานะออเดอร์ของตัวเอง' })
  getOrderStatus(
    @Param('id') id: string,
    @Query('sessionToken') sessionToken: string,
  ) {
    return this.publicService.getOrderStatus(id, sessionToken);
  }

  @Post('call-staff')
  @ApiOperation({ summary: 'ลูกค้าเรียกพนักงานจากโต๊ะ' })
  callStaff(@Body() dto: CallStaffDto) {
    return this.publicService.callStaff(dto);
  }

  @Post('checkout')
  @ApiOperation({ summary: 'ลูกค้าขอเช็คบิลพร้อมเลือกวิธีจ่ายเงิน' })
  checkout(@Body() dto: CheckoutDto) {
    return this.publicService.checkout(dto);
  }
}
