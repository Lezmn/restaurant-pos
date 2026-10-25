import { Body, Controller, Get, Param, Patch, Post, Query, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { Roles } from '../auth/decorators/roles.decorator';
import { Audit } from '../audit/audit.decorator';
import { loadPayingTable, loadPayment } from '../audit/audit-loaders';
import { AuthenticatedUser } from '../auth/jwt.strategy';
import { ConfirmSlipDto } from './dto/confirm-slip.dto';
import { CreatePaymentDto } from './dto/create-payment.dto';
import { FindPaymentsQueryDto } from './dto/find-payments-query.dto';
import { VoidPaymentDto } from './dto/void-payment.dto';
import { PaymentSlipService } from './payment-slip.service';
import { PaymentsService } from './payments.service';

@ApiTags('payments')
@ApiBearerAuth()
@Controller('payments')
export class PaymentsController {
  constructor(
    private readonly paymentsService: PaymentsService,
    private readonly paymentSlip: PaymentSlipService,
  ) {}

  @Post()
  @Roles(Role.ADMIN, Role.STAFF)
  // เก็บประวัติเฉพาะบิลที่ลดราคา หรือ ADMIN ยืนยัน PromptPay เองโดยไม่มีสลิป
  @Audit(
    ({ body }) =>
      body.discountPercent ? 'PAYMENT_DISCOUNT' : body.slipOverrideReason ? 'PAYMENT_SLIP_OVERRIDE' : null,
    {
      before: loadPayingTable,
      targetId: ({ result }) => (result as { id: string }).id,
      details: ({ body, before, result }) => {
        const { receipt, method } = result as {
          method: string;
          receipt: { number: string; subtotal: unknown; discount: unknown; total: unknown };
        };
        return {
          ...(before as object),
          receiptNumber: receipt.number,
          method,
          subtotal: receipt.subtotal,
          discountPercent: body.discountPercent ?? null,
          discount: receipt.discount,
          total: receipt.total,
          note: body.note ?? null,
          slipOverrideReason: body.slipOverrideReason ?? null,
        };
      },
    },
  )
  @ApiOperation({
    summary:
      'ชำระเงิน — ส่ง tableSessionId เพื่อจ่ายทั้งโต๊ะ หรือส่ง orderIds เพื่อแยกบิล/รวมบิลข้ามโต๊ะ',
  })
  create(
    @Body() dto: CreatePaymentDto,
    @Req() request: { user: AuthenticatedUser },
  ) {
    return this.paymentsService.create(dto, request.user);
  }

  @Patch(':id/void')
  @Roles(Role.ADMIN, Role.STAFF)
  @Audit('PAYMENT_VOID', {
    before: loadPayment,
    details: ({ body, before }) => paymentDetails(before, { reason: body.reason }),
  })
  @ApiOperation({
    summary:
      'ยกเลิกบิลที่จ่ายผิด — คืนออเดอร์กลับเป็นเสิร์ฟแล้ว และเปิดโต๊ะกลับให้เก็บเงินใหม่',
  })
  voidPayment(
    @Param('id') id: string,
    @Body() dto: VoidPaymentDto,
    @Req() request: { user: AuthenticatedUser },
  ) {
    return this.paymentsService.voidPayment(id, dto, request.user);
  }

  @Get()
  @Roles(Role.ADMIN, Role.STAFF)
  @ApiOperation({
    summary: 'ดึงรายการชำระเงิน พร้อม receipt — ส่ง from/to เพื่อกรองตามเวลาจ่าย (ไม่ส่ง = ทั้งหมด)',
  })
  findAll(@Query() query: FindPaymentsQueryDto) {
    return this.paymentsService.findAll(query);
  }

  @Get(':id')
  @Roles(Role.ADMIN, Role.STAFF)
  @ApiOperation({ summary: 'ดึงการชำระเงินตาม id พร้อม receipt' })
  findOne(@Param('id') id: string) {
    return this.paymentsService.findOne(id);
  }

  @Post(':id/slip/recheck')
  @Roles(Role.ADMIN, Role.STAFF)
  @ApiOperation({ summary: 'ตรวจสลิปของบิลที่ "รอตรวจ" อีกครั้งทันที (ปกติระบบตรวจซ้ำเองทุก 2 นาที)' })
  recheckSlip(@Param('id') id: string) {
    return this.paymentSlip.recheck(id);
  }

  @Patch(':id/slip/confirm')
  @Roles(Role.ADMIN)
  @Audit('PAYMENT_SLIP_CONFIRM', {
    before: loadPayment,
    details: ({ body, before }) => paymentDetails(before, { reason: body.reason }),
  })
  @ApiOperation({
    summary: 'ADMIN ยืนยันรับเงินเองสำหรับบิลที่รอตรวจ/ตรวจไม่ผ่าน (ต้องมีเหตุผล)',
  })
  confirmSlip(
    @Param('id') id: string,
    @Body() dto: ConfirmSlipDto,
    @Req() request: { user: AuthenticatedUser },
  ) {
    return this.paymentSlip.confirmManually(id, dto.reason, request.user);
  }
}

type LoadedPayment = Awaited<ReturnType<typeof loadPayment>>;

function paymentDetails(before: unknown, extra: Record<string, unknown>) {
  const payment = before as LoadedPayment;
  return {
    receiptNumber: payment?.receipt?.number ?? null,
    tableNumber: payment?.tableSession.table.number ?? null,
    amount: payment?.amount ?? null,
    method: payment?.method ?? null,
    ...extra,
  };
}
