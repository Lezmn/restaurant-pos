import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import {
  OrderStatus,
  PaymentMethod,
  PaymentStatus,
  Prisma,
  SlipStatus,
  TableSessionStatus,
  TableStatus,
} from '@prisma/client';
import { AuthenticatedUser } from '../auth/jwt.strategy';
import { EventsGateway } from '../events/events.gateway';
import { PrismaService } from '../prisma/prisma.service';
import { closeSessionIfSettled } from '../table-sessions/session-settlement';
import { CreatePaymentDto } from './dto/create-payment.dto';
import { FindPaymentsQueryDto } from './dto/find-payments-query.dto';
import { VoidPaymentDto } from './dto/void-payment.dto';
import { PaymentSlipService, SlipFields } from './payment-slip.service';

const TABLE_SESSION_SELECT = {
  id: true,
  status: true,
  openedAt: true,
  closedAt: true,
  expiresAt: true,
  tableId: true,
  table: true,
} as const;

const PAYABLE_ORDER_INCLUDE = {
  items: { include: { menuItem: true, selectedOptions: true } },
} as const;

/** key ของ pg_advisory_xact_lock สำหรับออกเลขใบเสร็จ (เลขอะไรก็ได้ที่ไม่ชนกับ lock อื่นในระบบ) */
const RECEIPT_NUMBER_LOCK = 7_420_001;

/**
 * เวลารอของ transaction รับเงิน/ยกเลิกบิล — ค่า default ของ Prisma (รอ 2 วิ, รัน 5 วิ) สั้นไป
 * ตอนบิลเข้าพร้อมกันหลายโต๊ะ (ออกเลขใบเสร็จทีละใบ) หรือ DB ช้าชั่วคราว แล้วแคชเชียร์ได้ 500 เปล่า ๆ
 */
const BILLING_TX_OPTIONS = { maxWait: 10_000, timeout: 15_000 } as const;

type PayableOrder = Prisma.OrderGetPayload<{
  include: typeof PAYABLE_ORDER_INCLUDE;
}>;

@Injectable()
export class PaymentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventsGateway,
    private readonly paymentSlip: PaymentSlipService,
  ) {}

  async create(dto: CreatePaymentDto, user: AuthenticatedUser) {
    if (!dto.tableSessionId && !dto.orderIds?.length) {
      throw new BadRequestException('ต้องส่ง tableSessionId หรือ orderIds อย่างน้อยหนึ่งอย่าง');
    }

    // PromptPay: ตรวจสลิปกับ SlipOK ก่อนเข้า transaction (เรียก API ภายนอกในทรานแซกชัน = ล็อก DB ค้างระหว่างรอ)
    const slip =
      dto.method === PaymentMethod.PROMPTPAY ? await this.checkSlip(dto, user) : null;

    const result = await this.runBillingTransaction(async (tx) => {
      const orders = dto.orderIds?.length
        ? await this.resolveOrdersByIds(tx, dto.orderIds)
        : await this.resolveUnpaidSessionOrders(tx, dto.tableSessionId!);

      const subtotal = this.calculateOrdersTotal(orders);
      // ยอดบนจอ/QR ที่ลูกค้าจ่ายไปแล้ว ต้องตรงกับยอดที่จะบันทึก ไม่งั้นบันทึกเงินผิดเงียบ ๆ
      this.assertTotalUnchanged(subtotal, dto.expectedTotal);
      // แคชเชียร์ลดราคาได้ (ลูกค้าต่อรอง/ของมีตำหนิ) ส่วนต่างเก็บเป็นส่วนลดในใบเสร็จ
      const amount = this.resolveChargedAmount(subtotal, dto.amount);
      // ยอดเปลี่ยนระหว่างตรวจสลิปกับตอนบันทึก (มีออเดอร์ถูกแก้พอดี) — สลิปถูกตรวจกับยอดเก่า ห้ามบันทึก
      if (slip && !slip.charged.equals(amount)) {
        throw new ConflictException('ยอดบิลเปลี่ยนระหว่างตรวจสลิป กรุณาเปิดหน้ารับเงินใหม่');
      }
      // บิลนี้ผูกกับ session ของออเดอร์ใบแรก (กรณีรวมบิลข้ามโต๊ะจะมีหลาย session)
      const primarySessionId = orders[0].tableSessionId!;
      const primaryTableId = orders[0].tableId;

      // ช่องว่างล้วนถือว่าไม่มีหมายเหตุ
      const note = dto.note?.trim() || null;

      const payment = await tx.payment.create({
        data: {
          tableSessionId: primarySessionId,
          amount,
          method: dto.method,
          note,
          ...slip?.fields,
        },
      });

      // อัปเดตแบบมีเงื่อนไข กันกดรับเงินพร้อมกันสองเครื่อง: ใบที่สองจะรอ row lock
      // จนใบแรก commit แล้วเห็นว่าออเดอร์ถูกจ่ายไปแล้ว → นับได้ไม่ครบ → rollback ทั้งใบ
      const claimed = await tx.order.updateMany({
        where: {
          id: { in: orders.map((order) => order.id) },
          status: OrderStatus.SERVED,
          paymentId: null,
        },
        data: { status: OrderStatus.PAID, paymentId: payment.id },
      });
      if (claimed.count !== orders.length) {
        throw new ConflictException(
          'บิลนี้เพิ่งถูกเก็บเงินหรือแก้ไขไปจากอีกเครื่อง กรุณารีเฟรชแล้วลองใหม่',
        );
      }

      const receipt = await tx.receipt.create({
        data: {
          number: await this.generateReceiptNumber(tx),
          subtotal,
          discount: subtotal.minus(amount),
          total: amount,
          note,
          paymentId: payment.id,
          tableId: primaryTableId,
          tableSessionId: primarySessionId,
          items: { create: this.buildReceiptItems(orders) },
        },
        include: { items: true },
      });

      // ปิดเฉพาะ session ที่จ่ายครบทุกออเดอร์แล้ว (แยกบิลจ่ายบางส่วนจะยังไม่ปิด)
      const affectedSessionIds = [
        ...new Set(orders.map((order) => order.tableSessionId!)),
      ];
      const closedSessionIds: string[] = [];
      for (const sessionId of affectedSessionIds) {
        if (await closeSessionIfSettled(tx, sessionId)) {
          closedSessionIds.push(sessionId);
        }
      }

      return {
        ...payment,
        receipt,
        paidOrderIds: orders.map((order) => order.id),
        closedSessionIds,
        affectedSessionIds,
      };
    });

    // รวมบิลข้ามโต๊ะ = หลาย session; แจ้งลูกค้าทุกโต๊ะที่เกี่ยวข้อง
    const { affectedSessionIds, ...payload } = result;
    this.events.emitToStaff('payment.created', payload);
    for (const sessionId of affectedSessionIds) {
      this.events.emitToSession(
        sessionId,
        'payment.created',
        this.toCustomerPaymentEvent(payload.id, sessionId, payload.closedSessionIds),
      );
    }
    return payload;
  }

  /**
   * ตรวจสลิปของบิล PromptPay — คิดยอดจากออเดอร์จริงก่อน (นอก transaction)
   * แล้วค่อยให้ transaction ตรวจซ้ำว่ายอดไม่เปลี่ยน
   */
  private async checkSlip(
    dto: CreatePaymentDto,
    user: AuthenticatedUser,
  ): Promise<{ charged: Prisma.Decimal; fields: SlipFields }> {
    const orders = dto.orderIds?.length
      ? await this.resolveOrdersByIds(this.prisma, dto.orderIds)
      : await this.resolveUnpaidSessionOrders(this.prisma, dto.tableSessionId!);
    const subtotal = this.calculateOrdersTotal(orders);
    this.assertTotalUnchanged(subtotal, dto.expectedTotal);
    const charged = this.resolveChargedAmount(subtotal, dto.amount);

    const session = await this.prisma.tableSession.findUniqueOrThrow({
      where: { id: orders[0].tableSessionId! },
      select: { openedAt: true },
    });

    const fields = await this.paymentSlip.checkForNewPayment({
      slipPayload: dto.slipPayload,
      overrideReason: dto.slipOverrideReason,
      charged,
      sessionOpenedAt: session.openedAt,
      user,
    });
    return { charged, fields };
  }

  async voidPayment(id: string, dto: VoidPaymentDto) {
    const result = await this.runBillingTransaction(async (tx) => {
      const payment = await tx.payment.findUnique({
        where: { id },
        include: { orders: { select: { id: true, tableSessionId: true } } },
      });
      if (!payment) {
        throw new NotFoundException(`ไม่พบการชำระเงิน id: ${id}`);
      }
      if (payment.status === PaymentStatus.VOIDED) {
        throw new ConflictException('บิลนี้ถูกยกเลิกไปแล้ว');
      }

      const affectedSessionIds = [
        ...new Set(
          payment.orders
            .map((order) => order.tableSessionId)
            .filter((sessionId): sessionId is string => Boolean(sessionId)),
        ),
      ];
      // ต้องเปิด session เดิมกลับมาเก็บเงินใหม่ — ถ้าโต๊ะรับลูกค้ากลุ่มใหม่ไปแล้ว
      // จะกลายเป็นสอง session เปิดซ้อนกัน (QR เก่าสั่งอาหารได้อีก / ออเดอร์ใหม่ไปผิดบิล)
      await this.assertSessionsCanReopen(tx, affectedSessionIds);

      const voided = await tx.payment.update({
        where: { id },
        data: {
          status: PaymentStatus.VOIDED,
          voidedAt: new Date(),
          voidReason: dto.reason,
          // ปล่อยรหัสสลิปคืน ให้บันทึกบิลใหม่ด้วยสลิปเดิมได้ (เช่น กดผิดโต๊ะ)
          ...this.paymentSlip.releaseOnVoid(payment.slipTransRef),
        },
      });

      // ออเดอร์พวกนี้เสิร์ฟถึงมือลูกค้าไปแล้ว (ถึงได้เก็บเงิน) ยกเลิกบิลคือเรื่องของแคชเชียร์
      // ไม่ใช่ครัว — ปิดธงไว้ก่อนคืนสถานะ ไม่งั้นจะไปโผล่บอร์ดครัวเหมือนมีของต้องทำใหม่
      await tx.order.updateMany({
        where: { paymentId: id, clearedAt: null },
        data: { clearedAt: new Date() },
      });

      // คืนออเดอร์กลับไปสถานะเสิร์ฟแล้ว เพื่อให้เก็บเงินใหม่ได้
      await tx.order.updateMany({
        where: { paymentId: id },
        data: { status: OrderStatus.SERVED, paymentId: null },
      });

      for (const sessionId of affectedSessionIds) {
        await this.reopenSession(tx, sessionId);
      }

      return { ...voided, reopenedSessionIds: affectedSessionIds };
    });

    this.events.emitToStaff('payment.voided', result);
    for (const sessionId of result.reopenedSessionIds) {
      this.events.emitToSession(
        sessionId,
        'payment.voided',
        this.toCustomerPaymentEvent(result.id, sessionId, []),
      );
    }
    return result;
  }

  /**
   * payload ที่ส่งเข้าห้องลูกค้า — หน้าลูกค้าใช้แค่เป็นสัญญาณให้ดึงข้อมูลใหม่
   * ห้ามส่ง payment/ใบเสร็จทั้งก้อน: รวมบิลข้ามโต๊ะจะทำให้โต๊ะหนึ่งเห็นรายการอาหาร
   * ของอีกโต๊ะ และเห็นหมายเหตุ/เหตุผลยกเลิกบิลที่พนักงานพิมพ์ไว้
   */
  private toCustomerPaymentEvent(
    paymentId: string,
    sessionId: string,
    closedSessionIds: string[],
  ) {
    return {
      id: paymentId,
      tableSessionId: sessionId,
      sessionClosed: closedSessionIds.includes(sessionId),
    };
  }

  /**
   * transaction ของงานเงิน — ถ้าเริ่ม/รันไม่ทันเวลา (P2028) ทุกอย่าง rollback แล้ว ไม่มีบิลค้างครึ่ง ๆ
   * จึงบอกแคชเชียร์ให้กดใหม่ได้เลย แทนที่จะปล่อยเป็น 500 ที่ไม่รู้ว่าเงินเข้าหรือยัง
   */
  private async runBillingTransaction<T>(
    fn: (tx: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    try {
      return await this.prisma.$transaction(fn, BILLING_TX_OPTIONS);
    } catch (e) {
      // สลิปใบเดียวกันถูกบันทึกกับอีกบิลพร้อมกันพอดี (unique slipTransRef)
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === 'P2002' &&
        String(e.meta?.target ?? '').includes('slipTransRef')
      ) {
        throw new ConflictException('สลิปนี้ถูกใช้กับบิลอื่นแล้ว');
      }
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === 'P2028'
      ) {
        throw new ServiceUnavailableException(
          'ระบบตอบช้าชั่วคราว ยังไม่ได้บันทึกบิลนี้ กรุณากดบันทึกใหม่อีกครั้ง',
        );
      }
      throw e;
    }
  }

  findAll(query: FindPaymentsQueryDto = {}) {
    return this.prisma.payment.findMany({
      where: {
        paidAt: {
          ...(query.from ? { gte: new Date(query.from) } : {}),
          ...(query.to ? { lt: new Date(query.to) } : {}),
        },
        ...(query.slipIssues
          ? {
              status: PaymentStatus.COMPLETED,
              slipStatus: { in: [SlipStatus.PENDING, SlipStatus.FAILED] },
            }
          : {}),
      },
      include: {
        receipt: true,
        tableSession: { select: TABLE_SESSION_SELECT },
        orders: { select: { id: true, status: true } },
      },
      orderBy: { paidAt: 'desc' },
    });
  }

  async findOne(id: string) {
    const payment = await this.prisma.payment.findUnique({
      where: { id },
      include: {
        receipt: { include: { items: true } },
        tableSession: { select: TABLE_SESSION_SELECT },
        orders: { select: { id: true, status: true } },
      },
    });
    if (!payment) {
      throw new NotFoundException(`ไม่พบการชำระเงิน id: ${id}`);
    }
    return payment;
  }

  /** จ่ายเฉพาะออเดอร์ที่ระบุ — ใช้ทั้งแยกบิล และรวมบิลข้ามโต๊ะ */
  private async resolveOrdersByIds(
    tx: Prisma.TransactionClient,
    orderIds: string[],
  ): Promise<PayableOrder[]> {
    const uniqueIds = [...new Set(orderIds)];
    const orders = await tx.order.findMany({
      where: { id: { in: uniqueIds } },
      include: PAYABLE_ORDER_INCLUDE,
    });

    if (orders.length !== uniqueIds.length) {
      const found = new Set(orders.map((order) => order.id));
      const missing = uniqueIds.filter((id) => !found.has(id));
      throw new NotFoundException(`ไม่พบออเดอร์ id: ${missing.join(', ')}`);
    }

    for (const order of orders) {
      if (!order.tableSessionId) {
        throw new BadRequestException(
          `ออเดอร์ ${order.id} ไม่ได้อยู่ใน QR session จึงเก็บเงินแบบนี้ไม่ได้`,
        );
      }
      if (order.status === OrderStatus.PAID) {
        throw new ConflictException(`ออเดอร์ ${order.id} ถูกชำระเงินไปแล้ว`);
      }
      if (order.status !== OrderStatus.SERVED) {
        throw new BadRequestException(
          `ออเดอร์ ${order.id} ยังไม่ถูกเสิร์ฟ จึงเก็บเงินไม่ได้`,
        );
      }
    }

    return orders;
  }

  /** จ่ายทั้ง session (พฤติกรรมเดิม) — ต้องเสิร์ฟครบทุกออเดอร์ก่อน */
  private async resolveUnpaidSessionOrders(
    tx: Prisma.TransactionClient,
    tableSessionId: string,
  ): Promise<PayableOrder[]> {
    const session = await tx.tableSession.findUnique({
      where: { id: tableSessionId },
      select: { id: true },
    });
    if (!session) {
      throw new NotFoundException(`ไม่พบ QR session id: ${tableSessionId}`);
    }

    const orders = await tx.order.findMany({
      where: {
        tableSessionId,
        status: { not: OrderStatus.CANCELLED },
        paymentId: null,
      },
      include: PAYABLE_ORDER_INCLUDE,
    });

    if (orders.length === 0) {
      throw new BadRequestException('ยังไม่มีออเดอร์ที่ต้องชำระใน session นี้');
    }

    const hasNotReadyOrder = orders.some(
      (order) => order.status !== OrderStatus.SERVED,
    );
    if (hasNotReadyOrder) {
      throw new BadRequestException(
        'ชำระเงินได้เมื่อทุกออเดอร์ใน session ถูกเสิร์ฟแล้ว',
      );
    }

    return orders;
  }

  /** โต๊ะของ session ที่จะเปิดกลับ ต้องไม่มี session อื่นเปิดอยู่ */
  private async assertSessionsCanReopen(
    tx: Prisma.TransactionClient,
    sessionIds: string[],
  ) {
    const sessions = await tx.tableSession.findMany({
      where: { id: { in: sessionIds } },
      select: { id: true, tableId: true, table: { select: { number: true } } },
    });
    for (const session of sessions) {
      const other = await tx.tableSession.findFirst({
        where: {
          tableId: session.tableId,
          status: TableSessionStatus.OPEN,
          id: { not: session.id },
        },
        select: { id: true },
      });
      if (other) {
        throw new ConflictException(
          `ยกเลิกบิลไม่ได้: โต๊ะ ${session.table.number} เปิดรับลูกค้ารอบใหม่แล้ว ต้องปิดโต๊ะรอบปัจจุบันก่อน`,
        );
      }
    }
  }

  /** เปิด session กลับหลังยกเลิกบิล เพื่อให้เก็บเงินใหม่ได้ */
  private async reopenSession(
    tx: Prisma.TransactionClient,
    tableSessionId: string,
  ) {
    const session = await tx.tableSession.findUnique({
      where: { id: tableSessionId },
      select: { id: true, status: true, tableId: true },
    });
    if (!session || session.status === TableSessionStatus.OPEN) return;

    await tx.tableSession.update({
      where: { id: tableSessionId },
      data: { status: TableSessionStatus.OPEN, closedAt: null },
    });
    await tx.restaurantTable.update({
      where: { id: session.tableId },
      data: { status: TableStatus.OCCUPIED },
    });
  }

  private assertTotalUnchanged(subtotal: Prisma.Decimal, expected?: number) {
    if (expected === undefined) return;
    if (!subtotal.equals(new Prisma.Decimal(expected))) {
      throw new ConflictException(
        `ยอดบิลเปลี่ยนจาก ${new Prisma.Decimal(expected).toFixed(2)} เป็น ${subtotal.toFixed(2)} (มีออเดอร์ถูกยกเลิกหรือเสิร์ฟเพิ่ม) กรุณาปิดแล้วเปิดหน้ารับเงินใหม่`,
      );
    }
  }

  /** ยอดที่เก็บจริง — ไม่ส่งมา = เต็มบิล; เก็บเกินยอดบิลไม่ได้ (เงินที่เกินคือเงินทอน ไม่ใช่รายได้) */
  private resolveChargedAmount(subtotal: Prisma.Decimal, requested?: number) {
    if (requested === undefined) return subtotal;

    const charged = new Prisma.Decimal(requested);
    if (charged.greaterThan(subtotal)) {
      throw new BadRequestException(
        `ยอดที่เก็บจริง (${charged.toFixed(2)}) มากกว่ายอดบิล (${subtotal.toFixed(2)}) ไม่ได้`,
      );
    }
    return charged;
  }

  private calculateOrdersTotal(orders: PayableOrder[]) {
    return orders.reduce(
      (orderSum, order) =>
        orderSum.plus(
          order.items.reduce((itemSum, item) => {
            const optionTotal = item.selectedOptions.reduce(
              (optionSum, option) => optionSum.plus(option.price),
              new Prisma.Decimal(0),
            );
            return itemSum.plus(
              item.unitPrice.plus(optionTotal).mul(item.quantity),
            );
          }, new Prisma.Decimal(0)),
        ),
      new Prisma.Decimal(0),
    );
  }

  private buildReceiptItems(orders: PayableOrder[]) {
    return orders.flatMap((order) =>
      order.items.map((item) => {
        const optionTotal = item.selectedOptions.reduce(
          (sum, option) => sum.plus(option.price),
          new Prisma.Decimal(0),
        );
        const lineTotal = item.unitPrice.plus(optionTotal).mul(item.quantity);

        return {
          name: item.menuItem.name,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          optionTotal,
          lineTotal,
          note: item.note,
          orderId: order.id,
        };
      }),
    );
  }

  private async generateReceiptNumber(tx: Prisma.TransactionClient) {
    // นับแล้ว +1 จะได้เลขซ้ำถ้าสองบิลออกพร้อมกัน — ล็อกให้ออกเลขทีละใบ
    // advisory lock ระดับ transaction ปล่อยเองตอน commit/rollback
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(${RECEIPT_NUMBER_LOCK})`;

    const now = new Date();
    const datePrefix = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;

    const todayCount = await tx.receipt.count({
      where: {
        issuedAt: {
          gte: new Date(now.getFullYear(), now.getMonth(), now.getDate()),
        },
      },
    });

    return `RCPT-${datePrefix}-${String(todayCount + 1).padStart(4, '0')}`;
  }
}
