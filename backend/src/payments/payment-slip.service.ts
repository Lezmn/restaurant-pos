import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PaymentStatus, Prisma, Role, SlipStatus } from '@prisma/client';
import { AuthenticatedUser } from '../auth/jwt.strategy';
import { EventsGateway } from '../events/events.gateway';
import { PrismaService } from '../prisma/prisma.service';
import { SlipCheckResult, SlipOkService } from '../slipok/slipok.service';

/** โอนก่อนเปิดโต๊ะได้ไม่เกินเท่านี้ (เผื่อนาฬิกาเครื่องคลาดกัน) — เกินนี้คือสลิปของรายการอื่น */
const TRANSFER_BEFORE_OPEN_TOLERANCE_MS = 10 * 60 * 1000;

/** ฟิลด์สลิปที่จะเขียนลง Payment ตอนสร้างบิล */
export type SlipFields = Pick<
  Prisma.PaymentUncheckedCreateInput,
  | 'slipStatus'
  | 'slipPayload'
  | 'slipTransRef'
  | 'slipAmount'
  | 'slipTransAt'
  | 'slipSendingBank'
  | 'slipMessage'
  | 'slipAttempts'
  | 'slipCheckedAt'
  | 'slipOverrideReason'
  | 'slipOverrideByName'
>;

type Verified = Extract<SlipCheckResult, { kind: 'verified' }>;

/**
 * ตรวจสลิป PromptPay — ใช้ร่วมกัน 3 จังหวะ
 *   1. ตอนรับเงิน (ก่อนเข้า transaction — เรียก API ภายนอกในทรานแซกชันจะล็อก DB ค้างระหว่างรอ)
 *   2. ตรวจซ้ำอัตโนมัติ สำหรับบิลที่ตอนรับเงินตรวจไม่ได้ (PENDING)
 *   3. ADMIN ยืนยันเอง (MANUAL) เมื่อไม่มีสลิป/ตรวจไม่ผ่านแต่ตรวจยอดเข้าเองแล้ว
 */
@Injectable()
export class PaymentSlipService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PaymentSlipService.name);
  private readonly intervalMs: number;
  private readonly maxAttempts: number;
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly slipOk: SlipOkService,
    private readonly events: EventsGateway,
    config: ConfigService,
  ) {
    // ค่าเริ่มต้น: ตรวจซ้ำทุก 2 นาที สูงสุด 15 ครั้ง (~30 นาที) — ครอบคลุม 1009 ที่ SlipOK ให้รอ 15 นาที
    this.intervalMs = Number(config.get('SLIP_RECHECK_INTERVAL_MS') ?? 120_000);
    this.maxAttempts = Number(config.get('SLIP_RECHECK_MAX_ATTEMPTS') ?? 15);
  }

  onModuleInit() {
    if (this.intervalMs <= 0) return; // 0 = ปิดการตรวจซ้ำอัตโนมัติ
    this.timer = setInterval(() => void this.recheckPending(), this.intervalMs);
    this.timer.unref();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  // ---------------------------------------------------------------------------
  // 1. ตอนรับเงิน
  // ---------------------------------------------------------------------------

  /**
   * คืนฟิลด์สลิปสำหรับบิล PromptPay ใบใหม่ — throw ถ้าสลิปใช้ไม่ได้ (ไม่สร้างบิลเลย)
   * @param charged ยอดที่เก็บจริง (หลังส่วนลด) — ต้องตรงกับยอดในสลิป
   */
  async checkForNewPayment(input: {
    slipPayload?: string;
    overrideReason?: string;
    /** ออกใบเสร็จพร้อม QR ก่อน แนบสลิปทีหลัง */
    slipLater?: boolean;
    charged: Prisma.Decimal;
    sessionOpenedAt: Date;
    user: AuthenticatedUser;
  }): Promise<SlipFields> {
    const { slipPayload, overrideReason, slipLater, charged, sessionOpenedAt, user } = input;

    if (!slipPayload) {
      // ลูกค้าจ่ายที่เคาน์เตอร์: พิมพ์ใบเสร็จที่มี QR ให้สแกน แล้วแคชเชียร์แนบสลิปจากรายการบิล
      if (slipLater && !overrideReason) return { slipStatus: SlipStatus.AWAITING };
      if (!overrideReason) {
        throw new BadRequestException(
          'PromptPay ต้องสแกนสลิปให้ระบบตรวจก่อนบันทึก (ถ้าไม่มีสลิป ให้ ADMIN ยืนยันเองพร้อมเหตุผล)',
        );
      }
      this.assertAdmin(user);
      return {
        slipStatus: SlipStatus.MANUAL,
        slipOverrideReason: overrideReason,
        slipOverrideByName: user.name,
        slipCheckedAt: new Date(),
      };
    }

    // ยกเลิกบิลแล้วบันทึกใหม่ด้วยสลิปเดิม (เช่น กดผิดโต๊ะ) — ส่งไป SlipOK ซ้ำจะโดน 1012 สลิปซ้ำ
    // จึงใช้ผลตรวจจากบิลที่ยกเลิกไปแทน (ตอนยกเลิกบิลเราปล่อย slipTransRef คืนไว้แล้ว)
    const reused = await this.prisma.payment.findFirst({
      where: {
        slipPayload,
        status: PaymentStatus.VOIDED,
        slipStatus: SlipStatus.VERIFIED,
      },
      orderBy: { voidedAt: 'desc' },
    });
    if (reused?.slipAmount && reused.slipTransAt) {
      return this.verifiedFields(
        slipPayload,
        {
          kind: 'verified',
          transRef: this.transRefFromVoided(reused.slipMessage) ?? `REUSED-${reused.id}`,
          amount: Number(reused.slipAmount),
          transAt: reused.slipTransAt,
          sendingBank: reused.slipSendingBank,
          receivingBank: null,
        },
        charged,
        sessionOpenedAt,
        'ใช้ผลตรวจจากบิลที่ยกเลิกไป',
      );
    }

    const result = await this.slipOk.check(slipPayload, Number(charged));
    if (result.kind === 'rejected') {
      throw new BadRequestException(`ตรวจสลิปไม่ผ่าน: ${result.message}`);
    }
    if (result.kind === 'unavailable') {
      // ลูกค้าไม่ต้องยืนรอ — บันทึกบิลไว้ก่อน ระบบตรวจซ้ำเองเบื้องหลัง เจ้าของเห็นใน Dashboard
      return {
        slipStatus: SlipStatus.PENDING,
        slipPayload,
        slipMessage: result.message,
        slipAttempts: 1,
        slipCheckedAt: new Date(),
      };
    }
    return this.verifiedFields(slipPayload, result, charged, sessionOpenedAt);
  }

  /**
   * ตรวจผลที่ SlipOK ยืนยันแล้วซ้ำอีกชั้นฝั่งเรา แล้วคืนฟิลด์ VERIFIED
   * SlipOK ตรวจยอด (amount) ให้แล้ว แต่ยังต้องกัน: สลิปใบเดียวใช้หลายบิล, สลิปเก่าก่อนเปิดโต๊ะ
   */
  private async verifiedFields(
    slipPayload: string,
    result: Verified,
    charged: Prisma.Decimal,
    sessionOpenedAt: Date,
    note?: string,
  ): Promise<SlipFields> {
    const problem = await this.findProblem(result, charged, sessionOpenedAt);
    if (problem) throw new BadRequestException(`ตรวจสลิปไม่ผ่าน: ${problem}`);
    return {
      slipStatus: SlipStatus.VERIFIED,
      slipPayload,
      slipTransRef: result.transRef,
      slipAmount: new Prisma.Decimal(result.amount),
      slipTransAt: result.transAt,
      slipSendingBank: result.sendingBank,
      slipMessage: note ?? 'ตรวจผ่าน',
      slipAttempts: 1,
      slipCheckedAt: new Date(),
    };
  }

  /** คืนข้อความปัญหา หรือ null ถ้าผ่าน */
  private async findProblem(
    result: Verified,
    charged: Prisma.Decimal,
    sessionOpenedAt: Date,
    excludePaymentId?: string,
  ): Promise<string | null> {
    if (!new Prisma.Decimal(result.amount).equals(charged)) {
      return `ยอดในสลิป ${result.amount.toFixed(2)} ไม่ตรงกับยอดที่เก็บ ${charged.toFixed(2)}`;
    }
    if (result.transAt.getTime() < sessionOpenedAt.getTime() - TRANSFER_BEFORE_OPEN_TOLERANCE_MS) {
      return 'สลิปนี้โอนก่อนเปิดโต๊ะ — ไม่ใช่การจ่ายของบิลนี้';
    }
    const used = await this.prisma.payment.findFirst({
      where: {
        slipTransRef: result.transRef,
        ...(excludePaymentId ? { id: { not: excludePaymentId } } : {}),
      },
      include: { receipt: { select: { number: true } } },
    });
    if (used) {
      return `สลิปนี้ถูกใช้กับบิลอื่นแล้ว (ใบเสร็จ ${used.receipt?.number ?? used.id})`;
    }
    return null;
  }

  /**
   * แนบสลิปให้บิลที่ออกใบเสร็จไปแล้ว (รอสลิป) หรือสลิปเดิมไม่ผ่าน — ตรวจแบบเดียวกับตอนรับเงิน
   * สลิปใช้ไม่ได้ = 400 บิลยังรอสลิปเหมือนเดิม แนบใบใหม่ได้
   */
  async attachSlip(paymentId: string, slipPayload: string, user: AuthenticatedUser) {
    const payment = await this.prisma.payment.findUnique({
      where: { id: paymentId },
      include: { tableSession: { select: { openedAt: true } } },
    });
    if (!payment) throw new NotFoundException(`ไม่พบการชำระเงิน id: ${paymentId}`);
    if (payment.status !== PaymentStatus.COMPLETED) {
      throw new ConflictException('บิลนี้ถูกยกเลิกไปแล้ว');
    }
    if (payment.slipStatus !== SlipStatus.AWAITING && payment.slipStatus !== SlipStatus.FAILED) {
      throw new ConflictException('แนบสลิปได้เฉพาะบิลที่รอสลิป หรือสลิปเดิมไม่ผ่าน');
    }

    const fields = await this.checkForNewPayment({
      slipPayload,
      charged: payment.amount,
      sessionOpenedAt: payment.tableSession.openedAt,
      user,
    });

    let updated;
    try {
      updated = await this.prisma.payment.update({
        // เงื่อนไขสถานะเดิม กันแนบพร้อมกันสองเครื่อง / ADMIN ยืนยันเองไปพร้อมกัน
        where: { id: paymentId, slipStatus: payment.slipStatus },
        data: fields,
      });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw new ConflictException('สลิปนี้ถูกใช้กับบิลอื่นแล้ว');
      }
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2025') {
        throw new ConflictException('บิลนี้ถูกแนบสลิป/ยืนยันไปแล้ว');
      }
      throw e;
    }
    this.notify(updated.id, updated.slipStatus);
    return updated;
  }

  // ---------------------------------------------------------------------------
  // 2. ตรวจซ้ำบิลที่ค้าง PENDING
  // ---------------------------------------------------------------------------

  /** วนตรวจบิลที่รอตรวจทั้งหมด — กันรันซ้อนกันถ้ารอบก่อนยังไม่จบ */
  async recheckPending() {
    if (this.running) return;
    this.running = true;
    try {
      const pending = await this.prisma.payment.findMany({
        where: { slipStatus: SlipStatus.PENDING, status: PaymentStatus.COMPLETED },
        orderBy: { paidAt: 'asc' },
        take: 20,
        select: { id: true },
      });
      for (const { id } of pending) {
        await this.recheck(id).catch((e: unknown) =>
          this.logger.warn(`ตรวจสลิปซ้ำ ${id} ไม่สำเร็จ: ${e instanceof Error ? e.message : e}`),
        );
      }
    } finally {
      this.running = false;
    }
  }

  /** ผลตรวจซ้ำ → ค่าที่จะบันทึกลงบิล (ยังไม่รวมจำนวนครั้ง/เวลาตรวจ) */
  private async recheckOutcome(
    result: SlipCheckResult,
    payment: { id: string; amount: Prisma.Decimal; tableSession: { openedAt: Date } },
    attempts: number,
  ): Promise<Prisma.PaymentUpdateInput> {
    if (result.kind === 'verified') {
      const problem = await this.findProblem(
        result,
        payment.amount,
        payment.tableSession.openedAt,
        payment.id,
      );
      if (problem) return { slipStatus: SlipStatus.FAILED, slipMessage: problem };
      return {
        slipStatus: SlipStatus.VERIFIED,
        slipTransRef: result.transRef,
        slipAmount: new Prisma.Decimal(result.amount),
        slipTransAt: result.transAt,
        slipSendingBank: result.sendingBank,
        slipMessage: 'ตรวจผ่าน (ตรวจซ้ำ)',
      };
    }
    if (result.kind === 'rejected') {
      return { slipStatus: SlipStatus.FAILED, slipMessage: result.message };
    }
    // ระบบตรวจล่ม/ตอบช้า: ลองใหม่รอบหน้า จนครบจำนวนครั้งค่อยตัดสินว่าไม่ผ่าน
    if (attempts >= this.maxAttempts) {
      return {
        slipStatus: SlipStatus.FAILED,
        slipMessage: `ตรวจไม่สำเร็จภายในเวลาที่กำหนด: ${result.message}`,
      };
    }
    return { slipMessage: result.message };
  }

  /** ตรวจซ้ำ 1 บิล (เรียกจากรอบอัตโนมัติ หรือพนักงานกด "ตรวจอีกครั้ง") */
  async recheck(paymentId: string) {
    const payment = await this.prisma.payment.findUnique({
      where: { id: paymentId },
      include: { tableSession: { select: { openedAt: true } } },
    });
    if (!payment) throw new NotFoundException(`ไม่พบการชำระเงิน id: ${paymentId}`);
    if (payment.status !== PaymentStatus.COMPLETED || payment.slipStatus !== SlipStatus.PENDING) {
      throw new ConflictException('บิลนี้ไม่ได้อยู่ในสถานะรอตรวจสลิป');
    }
    if (!payment.slipPayload) {
      throw new ConflictException('บิลนี้ไม่มีข้อมูลสลิปให้ตรวจ');
    }

    const attempts = payment.slipAttempts + 1;
    const result = await this.slipOk.check(payment.slipPayload, Number(payment.amount));
    const data = await this.recheckOutcome(result, payment, attempts);

    let updated;
    try {
      updated = await this.prisma.payment.update({
        // เงื่อนไข PENDING กันชนกับ ADMIN ที่กดยืนยันเองไปพร้อม ๆ กัน
        where: { id: paymentId, slipStatus: SlipStatus.PENDING },
        data: { ...data, slipAttempts: attempts, slipCheckedAt: new Date() },
      });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        // บิลอื่นเพิ่งใช้สลิปเดียวกันไประหว่างตรวจ
        updated = await this.prisma.payment.update({
          where: { id: paymentId },
          data: {
            slipStatus: SlipStatus.FAILED,
            slipMessage: 'สลิปนี้ถูกใช้กับบิลอื่นแล้ว',
            slipAttempts: attempts,
            slipCheckedAt: new Date(),
          },
        });
      } else if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2025') {
        throw new ConflictException('บิลนี้ถูกยืนยัน/เปลี่ยนสถานะไปแล้ว');
      } else {
        throw e;
      }
    }

    this.notify(updated.id, updated.slipStatus);
    return updated;
  }

  // ---------------------------------------------------------------------------
  // 3. ADMIN ยืนยันเอง
  // ---------------------------------------------------------------------------

  async confirmManually(paymentId: string, reason: string, user: AuthenticatedUser) {
    // หลังเก็บเงินแล้ว หน้าร้านยืนยันเองได้ด้วย (ต้องมีเหตุผล + เก็บชื่อคนยืนยัน) — ตรงกับ @Roles(ADMIN, STAFF) ของ controller
    // ส่วนรับเงินโดยไม่ตรวจสลิปตอนเก็บเงิน (overrideReason ใน checkForNewPayment) ยังเป็น ADMIN เท่านั้น
    if (user.role !== Role.ADMIN && user.role !== Role.STAFF) {
      throw new ForbiddenException('ยืนยันรับเงินเองได้เฉพาะเจ้าของร้านและหน้าร้าน');
    }
    const payment = await this.prisma.payment.findUnique({ where: { id: paymentId } });
    if (!payment) throw new NotFoundException(`ไม่พบการชำระเงิน id: ${paymentId}`);
    if (payment.status !== PaymentStatus.COMPLETED) {
      throw new ConflictException('บิลนี้ถูกยกเลิกไปแล้ว');
    }
    if (
      payment.slipStatus !== SlipStatus.PENDING &&
      payment.slipStatus !== SlipStatus.FAILED &&
      payment.slipStatus !== SlipStatus.AWAITING
    ) {
      throw new ConflictException('ยืนยันเองได้เฉพาะบิลที่รอสลิป รอตรวจ หรือตรวจไม่ผ่าน');
    }
    const updated = await this.prisma.payment.update({
      where: { id: paymentId },
      data: {
        slipStatus: SlipStatus.MANUAL,
        slipOverrideReason: reason,
        slipOverrideByName: user.name,
        slipCheckedAt: new Date(),
      },
    });
    this.notify(updated.id, updated.slipStatus);
    return updated;
  }

  // ---------------------------------------------------------------------------

  /**
   * ยกเลิกบิล → ปล่อย slipTransRef คืน (unique) ให้บันทึกบิลใหม่ด้วยสลิปเดิมได้
   * รหัสเดิมเก็บไว้ในข้อความ เพื่อดูย้อนหลังและใช้ซ้ำตอนบันทึกใหม่
   */
  releaseOnVoid(transRef: string | null): Prisma.PaymentUpdateInput {
    if (!transRef) return {};
    return { slipTransRef: null, slipMessage: `ยกเลิกบิล — ปล่อยสลิป transRef=${transRef}` };
  }

  private transRefFromVoided(message: string | null) {
    return message?.match(/transRef=(\S+)/)?.[1] ?? null;
  }

  private assertAdmin(user: AuthenticatedUser) {
    if (user.role !== Role.ADMIN) {
      throw new ForbiddenException('ยืนยันการรับเงินโดยไม่ตรวจสลิปได้เฉพาะ ADMIN');
    }
  }

  private notify(id: string, slipStatus: SlipStatus | null) {
    this.events.emitToStaff('payment.slip-updated', { id, slipStatus });
  }
}
