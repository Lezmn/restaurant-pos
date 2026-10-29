import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import {
  BillSplitStatus,
  OrderStatus,
  PaymentMethod,
  PaymentStatus,
  Prisma,
  Role,
  SlipStatus,
  TableSessionStatus,
  TableStatus,
} from '@prisma/client';
import { toDateKey } from '../common/date-range.util';
import { carveOutItems, lockSessionSplit, previewSelection, releaseUnpaidSplits, splitShare } from './bill-split';
import { AuthenticatedUser } from '../auth/jwt.strategy';
import { EventsGateway } from '../events/events.gateway';
import { PrismaService } from '../prisma/prisma.service';
import {
  closeSessionIfSettled,
  isUniqueViolation,
} from '../table-sessions/session-settlement';
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
  isTakeaway: true,
  takeawayNo: true,
  customerName: true,
} as const;

const PAYABLE_ORDER_INCLUDE = {
  items: { include: { menuItem: true, selectedOptions: true } },
  tableSession: { select: { isTakeaway: true } },
} as const;

/**
 * ออเดอร์สถานะไหนเก็บเงินได้ — โต๊ะจริงต้องเสิร์ฟแล้ว (กินก่อนจ่าย)
 * บิลกลับบ้านจ่ายก่อนทำได้ (ลูกค้าจ่ายตอนสั่งที่เคาน์เตอร์) — ครัวยังเห็นและทำต่อตามปกติ
 * "จ่ายแล้ว" ของบิลกลับบ้านจึงดูจาก paymentId ไม่ใช่ status = PAID (status ยังเป็นของครัว)
 */
const PAYABLE_STATUSES: OrderStatus[] = [OrderStatus.SERVED];
const PREPAYABLE_STATUSES: OrderStatus[] = [OrderStatus.PENDING, OrderStatus.PREPARING, OrderStatus.SERVED];
const payableStatusesOf = (order: { tableSession: { isTakeaway: boolean } | null }) =>
  order.tableSession?.isTakeaway ? PREPAYABLE_STATUSES : PAYABLE_STATUSES;

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

/** พนักงานยกเลิกบิลได้ภายในเวลานี้หลังรับเงิน — หน้าจอใช้ค่าเดียวกัน (frontend PaidBills) */
export const STAFF_VOID_WINDOW_MS = 60 * 60 * 1000;

@Injectable()
export class PaymentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventsGateway,
    private readonly paymentSlip: PaymentSlipService,
  ) {}

  async create(dto: CreatePaymentDto, user: AuthenticatedUser) {
    this.assertPaymentTarget(dto);

    // PromptPay: ตรวจสลิปกับ SlipOK ก่อนเข้า transaction (เรียก API ภายนอกในทรานแซกชัน = ล็อก DB ค้างระหว่างรอ)
    const slip =
      dto.method === PaymentMethod.PROMPTPAY ? await this.checkSlip(dto, user) : null;

    const result = await this.runBillingTransaction(async (tx) => {
      if (dto.splitParts) return this.paySplitPart(tx, dto, slip);

      // แยกบิลตามรายการ: ย้ายรายการที่เลือกไปเป็นออเดอร์ใหม่ก่อน แล้วเก็บเงินแบบเลือกออเดอร์ตามปกติ
      const orderIds = dto.items?.length ? await carveOutItems(tx, dto.items) : dto.orderIds;
      const orders = orderIds?.length
        ? await this.resolveOrdersByIds(tx, orderIds)
        : await this.resolveUnpaidSessionOrders(tx, dto.tableSessionId!);
      if (!dto.items?.length) await releaseUnpaidSplits(tx, orders.map((o) => o.id));

      const subtotal = this.calculateOrdersTotal(orders);
      // ยอดบนจอ/QR ที่ลูกค้าจ่ายไปแล้ว ต้องตรงกับยอดที่จะบันทึก ไม่งั้นบันทึกเงินผิดเงียบ ๆ
      this.assertTotalUnchanged(subtotal, dto.expectedTotal);
      // แคชเชียร์ลดราคาเป็น % ได้ (ลูกค้าประจำ/ของมีตำหนิ) — คิดยอดที่นี่ ไม่เชื่อยอดจากหน้าจอ
      const { charged: amount, discount } = this.applyDiscountPercent(subtotal, dto.discountPercent, dto.method);
      this.assertSlipAmount(slip, amount);

      return this.recordPayment(tx, dto, slip, {
        orders,
        claimOrders: true,
        amount,
        bill: { subtotal, discount, discountPercent: dto.discountPercent ?? null, total: amount },
      });
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

  /** เก็บเงินได้ 4 แบบ: ทั้งโต๊ะ / เลือกออเดอร์ / เลือกรายการ / หารเท่ากัน (ทั้งโต๊ะเท่านั้น) */
  private assertPaymentTarget(dto: CreatePaymentDto) {
    if (!dto.tableSessionId && !dto.orderIds?.length && !dto.items?.length) {
      throw new BadRequestException('ต้องส่ง tableSessionId, orderIds หรือ items อย่างน้อยหนึ่งอย่าง');
    }
    if (dto.items?.length && dto.orderIds?.length) {
      throw new BadRequestException('เลือกรายการ (items) หรือเลือกออเดอร์ (orderIds) อย่างใดอย่างหนึ่ง');
    }
    if (dto.splitParts && (!dto.tableSessionId || dto.items?.length || dto.orderIds?.length)) {
      throw new BadRequestException('หารเท่ากันได้เฉพาะทั้งโต๊ะ (ส่ง tableSessionId อย่างเดียว)');
    }
  }

  /** ยอดเปลี่ยนระหว่างตรวจสลิปกับตอนบันทึก (มีออเดอร์ถูกแก้พอดี) — สลิปถูกตรวจกับยอดเก่า ห้ามบันทึก */
  private assertSlipAmount(slip: { charged: Prisma.Decimal } | null, amount: Prisma.Decimal) {
    if (slip && !slip.charged.equals(amount)) {
      throw new ConflictException('ยอดบิลเปลี่ยนระหว่างตรวจสลิป กรุณาเปิดหน้ารับเงินใหม่');
    }
  }

  /**
   * หารเท่ากัน: รับเงินคนถัดไปของโต๊ะนี้
   * เริ่มหารครั้งแรก = ล็อกชุดออเดอร์ที่ค้างจ่าย + ยอดหลังส่วนลดไว้ใน BillSplit
   * คนสุดท้ายจ่ายส่วนที่เหลือ (รวมเศษสตางค์) แล้วออเดอร์ทั้งชุดเป็น PAID / ปิดโต๊ะถ้าไม่เหลือค้าง
   */
  private async paySplitPart(
    tx: Prisma.TransactionClient,
    dto: CreatePaymentDto,
    slip: { charged: Prisma.Decimal; fields: SlipFields } | null,
  ) {
    const plan = await this.planSplitPart(tx, dto, { create: true });
    this.assertSlipAmount(slip, plan.amount);

    const result = await this.recordPayment(tx, dto, slip, {
      orders: plan.orders,
      claimOrders: plan.isFinal,
      amount: plan.amount,
      bill: {
        subtotal: plan.split.subtotal,
        discount: plan.split.discount,
        discountPercent: plan.split.discountPercent,
        total: plan.split.total,
      },
      split: { id: plan.split.id, part: plan.part, parts: plan.split.parts },
    });
    if (plan.isFinal) {
      await tx.billSplit.update({ where: { id: plan.split.id }, data: { status: BillSplitStatus.DONE } });
    }
    return result;
  }

  /**
   * คิดว่าคนถัดไปต้องจ่ายเท่าไหร่ — ใช้ทั้งตอนตรวจสลิป (create: false ไม่เขียนอะไร) และตอนบันทึกจริง
   */
  private async planSplitPart(
    tx: Prisma.TransactionClient,
    dto: CreatePaymentDto,
    options: { create: boolean },
  ) {
    const sessionId = dto.tableSessionId!;
    const parts = dto.splitParts!;
    if (options.create) await lockSessionSplit(tx, sessionId);

    let split = await tx.billSplit.findFirst({
      where: { tableSessionId: sessionId, status: BillSplitStatus.OPEN },
      include: { payments: { where: { status: PaymentStatus.COMPLETED }, select: { amount: true } } },
    });

    // ยังไม่มีใครจ่าย แล้วแคชเชียร์เปลี่ยนจำนวนคน/ส่วนลด = เริ่มหารใหม่
    const changedBeforeAnyPaid =
      split &&
      split.payments.length === 0 &&
      (split.parts !== parts || (split.discountPercent ?? null) !== (dto.discountPercent ?? null));
    if (split && changedBeforeAnyPaid) {
      if (options.create) await releaseUnpaidSplits(tx, (await this.splitOrderIds(tx, split.id)));
      split = null;
    }
    if (split && split.parts !== parts) {
      throw new ConflictException(
        `โต๊ะนี้หารจ่าย ${split.parts} คนอยู่ (จ่ายแล้ว ${split.payments.length} คน) — เปลี่ยนจำนวนคนไม่ได้แล้ว`,
      );
    }

    if (!split) {
      const orders = await this.resolveUnpaidSessionOrders(tx, sessionId);
      const subtotal = this.calculateOrdersTotal(orders);
      this.assertTotalUnchanged(subtotal, dto.expectedTotal);
      const { charged: total, discount } = this.applyDiscountPercent(subtotal, dto.discountPercent, dto.method);
      const draft = {
        id: '',
        parts,
        subtotal,
        discount,
        discountPercent: dto.discountPercent ?? null,
        total,
        payments: [] as { amount: Prisma.Decimal }[],
      };
      const created = options.create
        ? await tx.billSplit.create({
            data: {
              parts,
              subtotal,
              discount,
              discountPercent: dto.discountPercent ?? null,
              total,
              tableSessionId: sessionId,
              orders: { connect: orders.map((o) => ({ id: o.id })) },
            },
          })
        : null;
      return {
        split: { ...draft, id: created?.id ?? '' },
        orders,
        part: 1,
        isFinal: parts === 1,
        amount: splitShare(total, parts, 0, new Prisma.Decimal(0)),
      };
    }

    const orders = await tx.order.findMany({
      where: { billSplitId: split.id, paymentId: null, status: OrderStatus.SERVED },
      include: PAYABLE_ORDER_INCLUDE,
    });
    // ยอดล็อกไว้ตอนเริ่มหาร — ออเดอร์ในชุดถูกยกเลิก/แก้หลังมีคนจ่ายแล้ว ต้องให้คนตัดสินใจ ไม่เดาเอง
    if (orders.length === 0 || !this.calculateOrdersTotal(orders).equals(split.subtotal)) {
      throw new ConflictException(
        'รายการในบิลที่หารเปลี่ยนไปหลังมีคนจ่ายแล้ว — ยกเลิกส่วนที่จ่ายไปก่อน แล้วเริ่มหารใหม่',
      );
    }
    this.assertTotalUnchanged(split.subtotal, dto.expectedTotal);

    const paidCount = split.payments.length;
    const paidSum = split.payments.reduce((s, p) => s.plus(p.amount), new Prisma.Decimal(0));
    return {
      split,
      orders,
      part: paidCount + 1,
      isFinal: paidCount === split.parts - 1,
      amount: splitShare(split.total, split.parts, paidCount, paidSum),
    };
  }

  private async splitOrderIds(tx: Prisma.TransactionClient, splitId: string) {
    const orders = await tx.order.findMany({ where: { billSplitId: splitId }, select: { id: true } });
    return orders.map((o) => o.id);
  }

  /** สร้าง payment + ใบเสร็จ (+ ผูกออเดอร์ / ปิดโต๊ะ ถ้าเป็นการจ่ายที่ปิดบิล) */
  private async recordPayment(
    tx: Prisma.TransactionClient,
    dto: CreatePaymentDto,
    slip: { fields: SlipFields } | null,
    input: {
      orders: PayableOrder[];
      /** false = หารเท่ากันที่ยังไม่ใช่คนสุดท้าย: เก็บเงินไว้ก่อน ออเดอร์ยังค้างจ่าย */
      claimOrders: boolean;
      amount: Prisma.Decimal;
      bill: {
        subtotal: Prisma.Decimal;
        discount: Prisma.Decimal;
        discountPercent: number | null;
        total: Prisma.Decimal;
      };
      split?: { id: string; part: number; parts: number };
    },
  ) {
    const { orders } = input;
    // บิลนี้ผูกกับ session ของออเดอร์ใบแรก (กรณีรวมบิลข้ามโต๊ะจะมีหลาย session)
    const primarySessionId = orders[0].tableSessionId!;
    const primaryTableId = orders[0].tableId;

    // ช่องว่างล้วนถือว่าไม่มีหมายเหตุ
    const note = dto.note?.trim() || null;

    const payment = await tx.payment.create({
      data: {
        tableSessionId: primarySessionId,
        amount: input.amount,
        method: dto.method,
        note,
        ...slip?.fields,
        ...(input.split ? { billSplitId: input.split.id, splitPart: input.split.part } : {}),
      },
    });

    if (input.claimOrders) {
      // อัปเดตแบบมีเงื่อนไข กันกดรับเงินพร้อมกันสองเครื่อง: ใบที่สองจะรอ row lock
      // จนใบแรก commit แล้วเห็นว่าออเดอร์ถูกจ่ายไปแล้ว → นับได้ไม่ครบ → rollback ทั้งใบ
      const claimed = await tx.order.updateMany({
        where: {
          id: { in: orders.map((order) => order.id) },
          status: { in: payableStatusesOf(orders[0]) },
          paymentId: null,
        },
        data: { paymentId: payment.id },
      });
      if (claimed.count !== orders.length) {
        throw new ConflictException(
          'บิลนี้เพิ่งถูกเก็บเงินหรือแก้ไขไปจากอีกเครื่อง กรุณารีเฟรชแล้วลองใหม่',
        );
      }
      // เสิร์ฟแล้ว + จ่ายแล้ว = จบ — ที่ยังไม่เสิร์ฟ (กลับบ้านจ่ายก่อน) คงสถานะไว้ให้ครัวทำต่อ
      await tx.order.updateMany({
        where: { paymentId: payment.id, status: OrderStatus.SERVED },
        data: { status: OrderStatus.PAID },
      });
    }

    const receipt = await tx.receipt.create({
      data: {
        number: await this.generateReceiptNumber(tx),
        ...input.bill,
        splitPart: input.split?.part ?? null,
        splitParts: input.split?.parts ?? null,
        note,
        paymentId: payment.id,
        tableId: primaryTableId,
        tableSessionId: primarySessionId,
        items: { create: this.buildReceiptItems(orders) },
      },
      include: { items: true },
    });

    // ปิดเฉพาะ session ที่จ่ายครบทุกออเดอร์แล้ว (แยกบิลจ่ายบางส่วนจะยังไม่ปิด)
    const affectedSessionIds = [...new Set(orders.map((order) => order.tableSessionId!))];
    const closedSessionIds: string[] = [];
    if (input.claimOrders) {
      for (const sessionId of affectedSessionIds) {
        if (await closeSessionIfSettled(tx, sessionId)) {
          closedSessionIds.push(sessionId);
        }
      }
    }

    return {
      ...payment,
      receipt,
      paidOrderIds: input.claimOrders ? orders.map((order) => order.id) : [],
      closedSessionIds,
      affectedSessionIds,
    };
  }

  /**
   * ตรวจสลิปของบิล PromptPay — คิดยอดจากออเดอร์จริงก่อน (นอก transaction)
   * แล้วค่อยให้ transaction ตรวจซ้ำว่ายอดไม่เปลี่ยน
   */
  private async checkSlip(
    dto: CreatePaymentDto,
    user: AuthenticatedUser,
  ): Promise<{ charged: Prisma.Decimal; fields: SlipFields }> {
    const { charged, sessionId } = await this.previewCharge(dto);

    const session = await this.prisma.tableSession.findUniqueOrThrow({
      where: { id: sessionId },
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

  /** ยอดที่จะเก็บครั้งนี้ โดยยังไม่เขียนอะไรลง DB */
  private async previewCharge(dto: CreatePaymentDto) {
    if (dto.splitParts) {
      const plan = await this.planSplitPart(this.prisma, dto, { create: false });
      return { charged: plan.amount, sessionId: dto.tableSessionId! };
    }
    if (dto.items?.length) {
      const { subtotal, tableSessionId } = await previewSelection(this.prisma, dto.items);
      this.assertTotalUnchanged(subtotal, dto.expectedTotal);
      return { charged: this.applyDiscountPercent(subtotal, dto.discountPercent, dto.method).charged, sessionId: tableSessionId };
    }
    const orders = dto.orderIds?.length
      ? await this.resolveOrdersByIds(this.prisma, dto.orderIds)
      : await this.resolveUnpaidSessionOrders(this.prisma, dto.tableSessionId!);
    const subtotal = this.calculateOrdersTotal(orders);
    this.assertTotalUnchanged(subtotal, dto.expectedTotal);
    return {
      charged: this.applyDiscountPercent(subtotal, dto.discountPercent, dto.method).charged,
      sessionId: orders[0].tableSessionId!,
    };
  }

  async voidPayment(id: string, dto: VoidPaymentDto, user: AuthenticatedUser) {
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
      await this.assertCanVoid(tx, payment.paidAt, user);
      await this.reopenSplitOnVoid(tx, payment);

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
      // (เฉพาะที่เสิร์ฟแล้ว — บิลกลับบ้านที่จ่ายก่อนทำ ครัวยังต้องเห็นของที่ยังไม่เสร็จ)
      await tx.order.updateMany({
        where: { paymentId: id, status: OrderStatus.PAID, clearedAt: null },
        data: { clearedAt: new Date() },
      });

      // คืนออเดอร์กลับไปสถานะเสิร์ฟแล้ว เพื่อให้เก็บเงินใหม่ได้ — ที่ยังไม่เสิร์ฟคงสถานะครัวไว้
      await tx.order.updateMany({
        where: { paymentId: id, status: OrderStatus.PAID },
        data: { status: OrderStatus.SERVED },
      });
      await tx.order.updateMany({
        where: { paymentId: id },
        data: { paymentId: null },
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
        JSON.stringify(e.meta?.target ?? '').includes('slipTransRef')
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
      if (order.status === OrderStatus.PAID || order.paymentId) {
        throw new ConflictException(`ออเดอร์ ${order.id} ถูกชำระเงินไปแล้ว`);
      }
      if (!payableStatusesOf(order).includes(order.status)) {
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
      select: { id: true, isTakeaway: true },
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
      (order) => !payableStatusesOf(order).includes(order.status),
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
      select: { id: true, tableId: true, isTakeaway: true, table: { select: { number: true } } },
    });
    for (const session of sessions) {
      // บิลกลับบ้านหลายใบเปิดพร้อมกันบนโต๊ะเสมือนได้อยู่แล้ว — เปิดกลับได้เสมอ
      if (session.isTakeaway) continue;
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
      select: { id: true, status: true, tableId: true, isTakeaway: true },
    });
    if (!session || session.status === TableSessionStatus.OPEN) return;

    await tx.tableSession
      .update({
        where: { id: tableSessionId },
        data: { status: TableSessionStatus.OPEN, closedAt: null },
      })
      .catch((e: unknown) => {
        // assertSessionsCanReopen ผ่านแล้ว แต่มีเครื่องอื่นเปิดโต๊ะนี้รอบใหม่แทรกเข้ามาพอดี
        throw isUniqueViolation(e)
          ? new ConflictException(
              'ยกเลิกบิลไม่ได้: โต๊ะนี้เพิ่งเปิดรับลูกค้ารอบใหม่ ต้องปิดโต๊ะรอบปัจจุบันก่อน',
            )
          : e;
      });
    // โต๊ะเสมือนของกลับบ้านไม่มีสถานะว่าง/มีลูกค้า — เปิดบิลกลับอย่างเดียว
    if (session.isTakeaway) return;
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
  /**
   * ลดเป็น % ของยอดบิล — ปัดยอดส่วนลดเป็นสตางค์แบบปัดครึ่งขึ้น
   * หน้าจอแคชเชียร์คิดสูตรเดียวกัน (ยอด QR PromptPay ต้องตรงกับยอดที่บันทึก)
   */
  /**
   * หารเท่ากัน: ยกเลิกส่วนของคนหนึ่ง
   * - ส่วนสุดท้าย (ผูกออเดอร์) → ออเดอร์กลับเป็นค้างจ่าย (โค้ดด้านล่าง) และการหารกลับมาเปิด รับเงินคนสุดท้ายใหม่ได้
   * - ส่วนก่อนหน้า ตอนบิลยังไม่ครบ → แค่คืนเงินส่วนนั้น เก็บใหม่ได้
   * - ส่วนก่อนหน้า ตอนบิลจ่ายครบแล้ว → ห้าม เงินจะหายจากบิลที่ปิดไปแล้ว ต้องยกเลิกส่วนสุดท้ายก่อน
   */
  private async reopenSplitOnVoid(
    tx: Prisma.TransactionClient,
    payment: { billSplitId: string | null; orders: unknown[] },
  ) {
    if (!payment.billSplitId) return;
    const split = await tx.billSplit.findUnique({ where: { id: payment.billSplitId } });
    if (!split) return;
    const isFinalPart = payment.orders.length > 0;
    if (!isFinalPart && split.status === BillSplitStatus.DONE) {
      throw new ConflictException('บิลนี้หารจ่ายครบแล้ว — ยกเลิกส่วนของคนสุดท้ายก่อน แล้วค่อยยกเลิกส่วนนี้');
    }
    if (isFinalPart) {
      await tx.billSplit.update({ where: { id: split.id }, data: { status: BillSplitStatus.OPEN } });
    }
  }

  /**
   * กันยกเลิกบิลย้อนหลัง (เก็บเงินสด → ลูกค้ากลับ → ยกเลิกบิล → เงินหาย)
   * - วันที่ปิดยอดเงินสดแล้ว: ห้ามทุกคน ไม่งั้นยอดลิ้นชักที่นับไว้เพี้ยนเงียบ ๆ — ADMIN ลบการปิดยอดก่อน
   * - STAFF ยกเลิกได้ภายใน 1 ชม. หลังรับเงิน (ผิดพลาดจริงมักเจอตอนลูกค้ายังอยู่) เกินนั้นให้ ADMIN
   */
  private async assertCanVoid(tx: Prisma.TransactionClient, paidAt: Date, user: AuthenticatedUser) {
    const date = toDateKey(paidAt);
    const closed = await tx.dailyCashClose.findUnique({ where: { date }, select: { id: true } });
    if (closed) {
      throw new ConflictException(
        user.role === Role.ADMIN
          ? `วันที่ ${date} ปิดยอดเงินสดไปแล้ว — ลบการปิดยอดของวันนั้นก่อน (หน้าปิดยอดเงินสด) แล้วค่อยยกเลิกบิล`
          : `วันที่ ${date} ปิดยอดเงินสดไปแล้ว ยกเลิกบิลไม่ได้ — ให้เจ้าของร้านจัดการ`,
      );
    }
    if (user.role !== Role.ADMIN && Date.now() - paidAt.getTime() > STAFF_VOID_WINDOW_MS) {
      throw new ForbiddenException('บิลนี้รับเงินไปเกิน 1 ชม. แล้ว — ให้เจ้าของร้านเป็นคนยกเลิก');
    }
  }

  /**
   * เงินสดที่มีส่วนลด: ปัดยอดเก็บเป็นบาทเต็ม (เศษสตางค์ทอนไม่ได้) แบบปัดครึ่งขึ้น — .50 ขึ้นไปปัดขึ้น ต่ำกว่านั้นปัดลง
   * ต้องตรงกับ frontend lib/discount.ts
   */
  private applyDiscountPercent(subtotal: Prisma.Decimal, percent?: number, method?: PaymentMethod) {
    if (!percent) return { charged: subtotal, discount: new Prisma.Decimal(0) };
    let charged = subtotal.minus(
      subtotal.mul(percent).div(100).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP),
    );
    if (method === PaymentMethod.CASH) charged = charged.toDecimalPlaces(0, Prisma.Decimal.ROUND_HALF_UP);
    return { charged, discount: subtotal.minus(charged) };
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
          name: item.customName ?? item.menuItem?.name ?? 'รายการพิเศษ',
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
