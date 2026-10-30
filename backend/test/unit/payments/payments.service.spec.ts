import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import {
  OrderStatus,
  PaymentMethod,
  PaymentStatus,
  Prisma,
  Role,
  SlipStatus,
  TableSessionStatus,
} from '@prisma/client';
import { AuthenticatedUser } from '../../../src/auth/jwt.strategy';
import { EventsGateway } from '../../../src/events/events.gateway';
import { PrismaService } from '../../../src/prisma/prisma.service';
import { SlipOkService } from '../../../src/slipok/slipok.service';
import { PaymentSlipService } from '../../../src/payments/payment-slip.service';
import { PaymentsService } from '../../../src/payments/payments.service';
import { ConfigService } from '@nestjs/config';

const D = (v: number | string) => new Prisma.Decimal(v);

const staff: AuthenticatedUser = { id: 'u-staff', email: 's@x', name: 'Staff', role: Role.STAFF };
const admin: AuthenticatedUser = { id: 'u-admin', email: 'a@x', name: 'Admin', role: Role.ADMIN };

/** ออเดอร์ทรงเดียวกับ PAYABLE_ORDER_INCLUDE */
function order(
  id: string,
  items: { price: number; qty: number; options?: number[]; name?: string }[],
  overrides: Partial<{
    status: OrderStatus;
    tableSessionId: string | null;
    tableId: string;
    tableSession: { isTakeaway: boolean } | null;
  }> = {},
) {
  return {
    id,
    status: OrderStatus.SERVED,
    tableSessionId: 'sess-1',
    tableId: 'table-1',
    paymentId: null,
    tableSession: { isTakeaway: false },
    ...overrides,
    items: items.map((it, i) => ({
      id: `${id}-item-${i}`,
      quantity: it.qty,
      unitPrice: D(it.price),
      note: null,
      menuItem: { name: it.name ?? `menu-${i}` },
      selectedOptions: (it.options ?? []).map((p, j) => ({ id: `opt-${j}`, name: `o${j}`, price: D(p) })),
    })),
  };
}

function makePrisma() {
  const prisma: any = {
    order: { findMany: jest.fn(), updateMany: jest.fn(), count: jest.fn() },
    payment: { create: jest.fn(), findUnique: jest.fn(), update: jest.fn(), findFirst: jest.fn() },
    receipt: { create: jest.fn(), count: jest.fn().mockResolvedValue(0) },
    tableSession: {
      findUnique: jest.fn(),
      findUniqueOrThrow: jest.fn(),
      findMany: jest.fn().mockResolvedValue([]),
      findFirst: jest.fn().mockResolvedValue(null),
      update: jest.fn().mockResolvedValue({}),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    restaurantTable: { update: jest.fn() },
    serviceRequest: { updateMany: jest.fn() },
    dailyCashClose: { findUnique: jest.fn().mockResolvedValue(null) },
    orderItem: { findMany: jest.fn(), updateMany: jest.fn(), create: jest.fn() },
    $executeRaw: jest.fn(),
  };
  prisma.$transaction = jest.fn((fn: (tx: unknown) => unknown) => fn(prisma));
  return prisma;
}

describe('PaymentsService', () => {
  let service: PaymentsService;
  let prisma: ReturnType<typeof makePrisma>;
  let events: { emitToStaff: jest.Mock; emitToSession: jest.Mock };
  let slip: { checkForNewPayment: jest.Mock; releaseOnVoid: jest.Mock };

  beforeEach(async () => {
    prisma = makePrisma();
    events = { emitToStaff: jest.fn(), emitToSession: jest.fn() };
    slip = {
      checkForNewPayment: jest.fn().mockResolvedValue({ slipStatus: SlipStatus.VERIFIED }),
      releaseOnVoid: jest.fn().mockReturnValue({}),
    };
    const moduleRef = await Test.createTestingModule({
      providers: [
        PaymentsService,
        { provide: PrismaService, useValue: prisma },
        { provide: EventsGateway, useValue: events },
        { provide: PaymentSlipService, useValue: slip },
      ],
    }).compile();
    service = moduleRef.get(PaymentsService);

    prisma.payment.create.mockImplementation(({ data }: any) => Promise.resolve({ id: 'pay-1', ...data }));
    prisma.receipt.create.mockImplementation(({ data }: any) =>
      Promise.resolve({ id: 'rc-1', ...data, items: data.items.create }),
    );
    prisma.tableSession.findUnique.mockResolvedValue({ id: 'sess-1' });
    prisma.tableSession.findUniqueOrThrow.mockResolvedValue({ tableId: 'table-1', openedAt: new Date() });
  });

  const servedSessionOrders = () => [
    // (50 + 10 + 5) * 2 = 130
    order('o1', [{ price: 50, qty: 2, options: [10, 5] }]),
    // 45.5 * 1 + 20 * 3 = 105.5
    order('o2', [
      { price: 45.5, qty: 1 },
      { price: 20, qty: 3 },
    ]),
  ];

  describe('create — คิดเงิน', () => {
    it('ยอดบิล = sum((ราคา + ราคาตัวเลือก) × จำนวน) ทุกออเดอร์', async () => {
      prisma.order.findMany.mockResolvedValue(servedSessionOrders());
      prisma.order.updateMany.mockResolvedValue({ count: 2 });
      prisma.order.count.mockResolvedValue(0);

      const result: any = await service.create(
        { tableSessionId: 'sess-1', method: PaymentMethod.CASH },
        staff,
      );

      expect(Number(result.amount)).toBe(235.5);
      expect(Number(result.receipt.subtotal)).toBe(235.5);
      expect(Number(result.receipt.discount)).toBe(0);
      expect(Number(result.receipt.total)).toBe(235.5);
      const lines = result.receipt.items;
      expect(lines.map((l: any) => Number(l.lineTotal))).toEqual([130, 45.5, 60]);
      expect(Number(lines[0].optionTotal)).toBe(15);
    });

    it('ทศนิยมสตางค์ไม่เพี้ยนแบบ float (0.1 + 0.2)', async () => {
      prisma.order.findMany.mockResolvedValue([
        order('o1', [{ price: 0.1, qty: 1 }, { price: 0.2, qty: 1 }]),
      ]);
      prisma.order.updateMany.mockResolvedValue({ count: 1 });
      prisma.order.count.mockResolvedValue(0);
      const result: any = await service.create(
        { tableSessionId: 'sess-1', method: PaymentMethod.CASH, expectedTotal: 0.3 },
        staff,
      );
      expect(result.amount.toString()).toBe('0.3');
    });

    it('ส่วนลด 10% เงินสด: ยอดเก็บปัดครึ่งขึ้นเป็นบาทเต็ม (211.95 → 212) และเก็บ % ไว้ในใบเสร็จ', async () => {
      prisma.order.findMany.mockResolvedValue(servedSessionOrders());
      prisma.order.updateMany.mockResolvedValue({ count: 2 });
      prisma.order.count.mockResolvedValue(0);
      const result: any = await service.create(
        { tableSessionId: 'sess-1', method: PaymentMethod.CASH, discountPercent: 10 },
        staff,
      );
      expect(Number(result.receipt.subtotal)).toBe(235.5);
      expect(Number(result.receipt.discount)).toBe(23.5);
      expect(result.receipt.discountPercent).toBe(10);
      expect(Number(result.receipt.total)).toBe(212);
      expect(Number(result.amount)).toBe(212);
    });

    it('ส่วนลด 15% เงินสด: 235.50 − 35.33 = 200.17 → เก็บ 200 ส่วนลด 35.50', async () => {
      prisma.order.findMany.mockResolvedValue(servedSessionOrders());
      prisma.order.updateMany.mockResolvedValue({ count: 2 });
      prisma.order.count.mockResolvedValue(0);
      const result: any = await service.create(
        { tableSessionId: 'sess-1', method: PaymentMethod.CASH, discountPercent: 15 },
        staff,
      );
      expect(result.receipt.discount.toString()).toBe('35.5');
      expect(result.amount.toString()).toBe('200');
    });

    it('ส่วนลด 100% = ฟรีทั้งบิล ยอดเก็บ 0', async () => {
      prisma.order.findMany.mockResolvedValue(servedSessionOrders());
      prisma.order.updateMany.mockResolvedValue({ count: 2 });
      prisma.order.count.mockResolvedValue(0);
      const result: any = await service.create(
        { tableSessionId: 'sess-1', method: PaymentMethod.CASH, discountPercent: 100 },
        staff,
      );
      expect(Number(result.amount)).toBe(0);
      expect(Number(result.receipt.discount)).toBe(235.5);
    });

    it('ไม่ส่ง discountPercent = ไม่ลด และใบเสร็จไม่มี %', async () => {
      prisma.order.findMany.mockResolvedValue(servedSessionOrders());
      prisma.order.updateMany.mockResolvedValue({ count: 2 });
      prisma.order.count.mockResolvedValue(0);
      const result: any = await service.create(
        { tableSessionId: 'sess-1', method: PaymentMethod.CASH },
        staff,
      );
      expect(result.receipt.discountPercent).toBeNull();
    });

    it('ยอดบนจอ (expectedTotal) ไม่ตรงยอดจริง → 409 และไม่บันทึกอะไร', async () => {
      prisma.order.findMany.mockResolvedValue(servedSessionOrders());
      await expect(
        service.create(
          { tableSessionId: 'sess-1', method: PaymentMethod.CASH, expectedTotal: 230 },
          staff,
        ),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(prisma.payment.create).not.toHaveBeenCalled();
    });

    it('ยังมีออเดอร์ที่ไม่เสิร์ฟใน session → 400', async () => {
      prisma.order.findMany.mockResolvedValue([
        order('o1', [{ price: 50, qty: 1 }]),
        order('o2', [{ price: 50, qty: 1 }], { status: OrderStatus.PREPARING }),
      ]);
      await expect(
        service.create({ tableSessionId: 'sess-1', method: PaymentMethod.CASH }, staff),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('กลับบ้านจ่ายก่อนทำได้: ผูก payment ทุกใบ แต่เปลี่ยนเป็น PAID เฉพาะที่เสิร์ฟแล้ว', async () => {
      const takeaway = { tableSession: { isTakeaway: true } };
      prisma.tableSession.findUnique.mockResolvedValue({ id: 'sess-1', isTakeaway: true });
      prisma.order.findMany.mockResolvedValue([
        order('o1', [{ price: 50, qty: 1 }], { ...takeaway, status: OrderStatus.PENDING }),
        order('o2', [{ price: 30, qty: 1 }], { ...takeaway, status: OrderStatus.SERVED }),
      ]);
      prisma.order.updateMany.mockResolvedValue({ count: 2 });
      prisma.order.count.mockResolvedValue(0);

      const result: any = await service.create(
        { tableSessionId: 'sess-1', method: PaymentMethod.CASH },
        staff,
      );

      expect(Number(result.amount)).toBe(80);
      expect(prisma.order.updateMany).toHaveBeenCalledWith({
        where: {
          id: { in: ['o1', 'o2'] },
          status: { in: [OrderStatus.PENDING, OrderStatus.PREPARING, OrderStatus.SERVED] },
          paymentId: null,
        },
        data: { paymentId: 'pay-1' },
      });
      expect(prisma.order.updateMany).toHaveBeenCalledWith({
        where: { paymentId: 'pay-1', status: OrderStatus.SERVED },
        data: { status: OrderStatus.PAID },
      });
    });

    it('session ไม่มีออเดอร์ค้างจ่าย → 400', async () => {
      prisma.order.findMany.mockResolvedValue([]);
      await expect(
        service.create({ tableSessionId: 'sess-1', method: PaymentMethod.CASH }, staff),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('ไม่ส่ง tableSessionId → 400', async () => {
      await expect(service.create({ method: PaymentMethod.CASH } as any, staff)).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('กดรับเงินชนกันสองเครื่อง (claim ได้ไม่ครบ) → 409', async () => {
      prisma.order.findMany.mockResolvedValue(servedSessionOrders());
      prisma.order.updateMany.mockResolvedValue({ count: 1 });
      await expect(
        service.create({ tableSessionId: 'sess-1', method: PaymentMethod.CASH }, staff),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(prisma.receipt.create).not.toHaveBeenCalled();
    });

    it('จ่ายครบแล้วปิด session และส่ง event ให้ลูกค้าโดยไม่แนบรายละเอียดบิล', async () => {
      prisma.order.findMany.mockResolvedValue(servedSessionOrders());
      prisma.order.updateMany.mockResolvedValue({ count: 2 });
      prisma.order.count.mockResolvedValue(0);
      const result: any = await service.create(
        { tableSessionId: 'sess-1', method: PaymentMethod.CASH, note: '  ' },
        staff,
      );
      expect(result.closedSessionIds).toEqual(['sess-1']);
      expect(result.note).toBeNull();
      expect(events.emitToSession).toHaveBeenCalledWith('sess-1', 'payment.created', {
        id: 'pay-1',
        tableSessionId: 'sess-1',
        sessionClosed: true,
      });
    });

    it('เลขใบเสร็จ RCPT-YYYYMMDD-#### ตามวันเวลาไทย และนับต่อจากใบของวันนี้', async () => {
      prisma.order.findMany.mockResolvedValue(servedSessionOrders());
      prisma.order.updateMany.mockResolvedValue({ count: 2 });
      prisma.order.count.mockResolvedValue(0);
      prisma.receipt.count.mockResolvedValue(41);
      const result: any = await service.create(
        { tableSessionId: 'sess-1', method: PaymentMethod.CASH },
        staff,
      );
      const now = new Date();
      const ymd = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
      expect(result.receipt.number).toBe(`RCPT-${ymd}-0042`);
      expect(prisma.$executeRaw).toHaveBeenCalled();
    });

    it('PromptPay: ยอดเปลี่ยนระหว่างตรวจสลิปกับตอนบันทึก → 409', async () => {
      prisma.order.findMany
        .mockResolvedValueOnce([order('o1', [{ price: 100, qty: 1 }])]) // ตอนตรวจสลิป
        .mockResolvedValueOnce([order('o1', [{ price: 100, qty: 1 }]), order('o2', [{ price: 5, qty: 1 }])]);
      await expect(
        service.create(
          { tableSessionId: 'sess-1', method: PaymentMethod.PROMPTPAY, slipPayload: 'X' },
          staff,
        ),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(prisma.payment.create).not.toHaveBeenCalled();
    });
  });

  describe('voidPayment', () => {
    it('ยกเลิกบิลที่ยกเลิกไปแล้ว → 409', async () => {
      prisma.payment.findUnique.mockResolvedValue({ id: 'p', status: PaymentStatus.VOIDED, orders: [] });
      await expect(service.voidPayment('p', { reason: 'x' }, staff)).rejects.toBeInstanceOf(ConflictException);
    });

    it('ไม่พบบิล → 404', async () => {
      prisma.payment.findUnique.mockResolvedValue(null);
      await expect(service.voidPayment('p', { reason: 'x' }, staff)).rejects.toBeInstanceOf(NotFoundException);
    });

    it('โต๊ะเปิดรอบใหม่ไปแล้ว → 409 ไม่เปิด session เดิมซ้อน', async () => {
      prisma.payment.findUnique.mockResolvedValue({
        id: 'p',
        status: PaymentStatus.COMPLETED,
        paidAt: new Date(),
        orders: [{ id: 'o1', tableSessionId: 'sess-1' }],
      });
      prisma.tableSession.findMany.mockResolvedValue([
        { id: 'sess-1', tableId: 'table-1', table: { number: 3 } },
      ]);
      prisma.tableSession.findFirst.mockResolvedValue({ id: 'sess-2' });
      await expect(service.voidPayment('p', { reason: 'x' }, staff)).rejects.toBeInstanceOf(ConflictException);
      expect(prisma.payment.update).not.toHaveBeenCalled();
    });

    const paidPayment = (paidAt: Date) => ({
      id: 'p',
      status: PaymentStatus.COMPLETED,
      paidAt,
      slipTransRef: null,
      orders: [{ id: 'o1', tableSessionId: 'sess-1' }],
    });
    const hoursAgo = (h: number) => new Date(Date.now() - h * 60 * 60 * 1000);

    it('STAFF ยกเลิกบิลที่รับเงินเกิน 1 ชม. → 403 และไม่แตะอะไร', async () => {
      prisma.payment.findUnique.mockResolvedValue(paidPayment(hoursAgo(1.1)));
      await expect(service.voidPayment('p', { reason: 'x' }, staff)).rejects.toBeInstanceOf(ForbiddenException);
      expect(prisma.payment.update).not.toHaveBeenCalled();
    });

    it('ADMIN ยกเลิกบิลเกิน 1 ชม. ได้', async () => {
      prisma.payment.findUnique.mockResolvedValue(paidPayment(hoursAgo(5)));
      prisma.tableSession.findMany.mockResolvedValue([{ id: 'sess-1', tableId: 'table-1', table: { number: 3 } }]);
      prisma.payment.update.mockResolvedValue({ id: 'p', status: PaymentStatus.VOIDED });
      prisma.tableSession.findUnique.mockResolvedValue({ id: 'sess-1', status: TableSessionStatus.CLOSED, tableId: 'table-1' });
      await expect(service.voidPayment('p', { reason: 'x' }, admin)).resolves.toBeDefined();
    });

    it('วันที่ปิดยอดแล้ว → 409 ทั้ง STAFF และ ADMIN (ต้องลบการปิดยอดก่อน)', async () => {
      prisma.payment.findUnique.mockResolvedValue(paidPayment(hoursAgo(0.1)));
      prisma.dailyCashClose.findUnique.mockResolvedValue({ id: 'close-1' });
      for (const user of [staff, admin]) {
        await expect(service.voidPayment('p', { reason: 'x' }, user)).rejects.toBeInstanceOf(ConflictException);
      }
      expect(prisma.payment.update).not.toHaveBeenCalled();
    });

    it('ยกเลิกสำเร็จ: คืนออเดอร์เป็น SERVED และเปิด session กลับ', async () => {
      prisma.payment.findUnique.mockResolvedValue({
        id: 'p',
        status: PaymentStatus.COMPLETED,
        paidAt: new Date(),
        slipTransRef: null,
        orders: [{ id: 'o1', tableSessionId: 'sess-1' }],
      });
      prisma.tableSession.findMany.mockResolvedValue([
        { id: 'sess-1', tableId: 'table-1', table: { number: 3 } },
      ]);
      prisma.payment.update.mockResolvedValue({ id: 'p', status: PaymentStatus.VOIDED });
      prisma.tableSession.findUnique.mockResolvedValue({
        id: 'sess-1',
        status: TableSessionStatus.CLOSED,
        tableId: 'table-1',
      });
      const result = await service.voidPayment('p', { reason: 'จ่ายผิดโต๊ะ' }, staff);
      expect(result.reopenedSessionIds).toEqual(['sess-1']);
      expect(prisma.order.updateMany).toHaveBeenCalledWith({
        where: { paymentId: 'p', status: OrderStatus.PAID },
        data: { status: OrderStatus.SERVED },
      });
      expect(prisma.order.updateMany).toHaveBeenCalledWith({
        where: { paymentId: 'p' },
        data: { paymentId: null },
      });
      expect(prisma.tableSession.update).toHaveBeenCalledWith({
        where: { id: 'sess-1' },
        data: { status: TableSessionStatus.OPEN, closedAt: null },
      });
    });
  });
});

describe('PaymentSlipService', () => {
  let service: PaymentSlipService;
  let prisma: any;
  let slipOk: { check: jest.Mock };

  beforeEach(() => {
    prisma = {
      payment: { findFirst: jest.fn().mockResolvedValue(null), findUnique: jest.fn(), update: jest.fn() },
    };
    slipOk = { check: jest.fn() };
    const config = { get: () => '0' } as unknown as ConfigService;
    service = new PaymentSlipService(prisma, slipOk as unknown as SlipOkService, { emitToStaff: jest.fn() } as any, config);
  });

  const base = { charged: D(150), sessionOpenedAt: new Date(Date.now() - 60_000) };

  it('ไม่มีสลิปและไม่มีเหตุผล → 400', async () => {
    await expect(service.checkForNewPayment({ ...base, user: staff })).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('ยืนยันเองโดยไม่มีสลิป: STAFF → 403, ADMIN → MANUAL', async () => {
    await expect(
      service.checkForNewPayment({ ...base, overrideReason: 'เช็คแอปแล้ว', user: staff }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    const fields = await service.checkForNewPayment({ ...base, overrideReason: 'เช็คแอปแล้ว', user: admin });
    expect(fields.slipStatus).toBe(SlipStatus.MANUAL);
    expect(fields.slipOverrideByName).toBe('Admin');
  });

  it('ยอดในสลิปไม่ตรงยอดที่เก็บ → 400', async () => {
    slipOk.check.mockResolvedValue({
      kind: 'verified', transRef: 'T1', amount: 149, transAt: new Date(), sendingBank: null, receivingBank: null,
    });
    await expect(service.checkForNewPayment({ ...base, slipPayload: 'p', user: staff })).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('สลิปโอนก่อนเปิดโต๊ะเกิน 10 นาที → 400', async () => {
    slipOk.check.mockResolvedValue({
      kind: 'verified', transRef: 'T1', amount: 150,
      transAt: new Date(base.sessionOpenedAt.getTime() - 11 * 60_000), sendingBank: null, receivingBank: null,
    });
    await expect(service.checkForNewPayment({ ...base, slipPayload: 'p', user: staff })).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('สลิปเคยใช้กับบิลอื่น → 400', async () => {
    slipOk.check.mockResolvedValue({
      kind: 'verified', transRef: 'T1', amount: 150, transAt: new Date(), sendingBank: null, receivingBank: null,
    });
    prisma.payment.findFirst
      .mockResolvedValueOnce(null) // ไม่มีบิลที่ยกเลิกให้ใช้ซ้ำ
      .mockResolvedValueOnce({ id: 'other', receipt: { number: 'RCPT-1' } });
    await expect(service.checkForNewPayment({ ...base, slipPayload: 'p', user: staff })).rejects.toThrow(
      /ถูกใช้กับบิลอื่น/,
    );
  });

  it('SlipOK ล่ม → บันทึกเป็น PENDING ไม่ขวางการรับเงิน', async () => {
    slipOk.check.mockResolvedValue({ kind: 'unavailable', code: 1009, message: 'down' });
    const fields = await service.checkForNewPayment({ ...base, slipPayload: 'p', user: staff });
    expect(fields.slipStatus).toBe(SlipStatus.PENDING);
    expect(fields.slipAttempts).toBe(1);
  });

  it('SlipOK ปฏิเสธ → 400', async () => {
    slipOk.check.mockResolvedValue({ kind: 'rejected', code: 1012, message: 'dup' });
    await expect(service.checkForNewPayment({ ...base, slipPayload: 'p', user: staff })).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('ยืนยันเอง (confirmManually) ได้เฉพาะบิล AWAITING/PENDING/FAILED และเฉพาะ ADMIN/STAFF', async () => {
    const kitchen: AuthenticatedUser = { id: 'u-k', email: 'k@x', name: 'Kitchen', role: Role.KITCHEN };
    await expect(service.confirmManually('p', 'r', kitchen)).rejects.toBeInstanceOf(ForbiddenException);
    prisma.payment.findUnique.mockResolvedValue({ id: 'p', status: PaymentStatus.COMPLETED, slipStatus: SlipStatus.VERIFIED });
    await expect(service.confirmManually('p', 'r', admin)).rejects.toBeInstanceOf(ConflictException);
    prisma.payment.findUnique.mockResolvedValue({ id: 'p', status: PaymentStatus.VOIDED, slipStatus: SlipStatus.PENDING });
    await expect(service.confirmManually('p', 'r', admin)).rejects.toBeInstanceOf(ConflictException);
  });

  // ทดสอบ: หน้าร้าน (STAFF) ยืนยันบิลที่รอสลิปเองได้ — บันทึกเหตุผลและชื่อคนยืนยัน
  it('STAFF ยืนยันบิลรอสลิปเอง → MANUAL พร้อมเหตุผลและชื่อ', async () => {
    prisma.payment.findUnique.mockResolvedValue({ id: 'p', status: PaymentStatus.COMPLETED, slipStatus: SlipStatus.AWAITING });
    prisma.payment.update.mockImplementation(({ data }: any) => Promise.resolve({ id: 'p', ...data }));
    const updated: any = await service.confirmManually('p', 'เช็คแอปแล้ว', staff);
    expect(updated).toMatchObject({ slipStatus: SlipStatus.MANUAL, slipOverrideReason: 'เช็คแอปแล้ว', slipOverrideByName: 'Staff' });
  });

  it('ตรวจซ้ำครบจำนวนครั้งแล้วยังล่ม → FAILED', async () => {
    const config = { get: (k: string) => (k === 'SLIP_RECHECK_MAX_ATTEMPTS' ? '3' : '0') } as unknown as ConfigService;
    service = new PaymentSlipService(prisma, slipOk as any, { emitToStaff: jest.fn() } as any, config);
    prisma.payment.findUnique.mockResolvedValue({
      id: 'p', status: PaymentStatus.COMPLETED, slipStatus: SlipStatus.PENDING, slipPayload: 'x',
      slipAttempts: 2, amount: D(100), tableSession: { openedAt: new Date() },
    });
    slipOk.check.mockResolvedValue({ kind: 'unavailable', code: 1009, message: 'down' });
    prisma.payment.update.mockImplementation(({ data }: any) => Promise.resolve({ id: 'p', ...data }));
    const updated: any = await service.recheck('p');
    expect(updated.slipStatus).toBe(SlipStatus.FAILED);
    expect(updated.slipAttempts).toBe(3);
  });

  describe('recheck — ตรวจซ้ำบิลที่รอตรวจ', () => {
    const pending = {
      id: 'p', status: PaymentStatus.COMPLETED, slipStatus: SlipStatus.PENDING, slipPayload: 'x',
      slipAttempts: 1, amount: D(100), tableSession: { openedAt: new Date(Date.now() - 60_000) },
    };
    const verified = (overrides: Record<string, unknown> = {}) => ({
      kind: 'verified', transRef: 'T9', amount: 100, transAt: new Date(), sendingBank: '004', receivingBank: '014',
      ...overrides,
    });
    const known = (code: string) => new Prisma.PrismaClientKnownRequestError('x', { code, clientVersion: 'x' });

    beforeEach(() => {
      // ปิดรอบอัตโนมัติ แต่ใช้จำนวนครั้งตรวจซ้ำค่าเริ่มต้น (15)
      const config = { get: (k: string) => (k === 'SLIP_RECHECK_INTERVAL_MS' ? '0' : undefined) } as unknown as ConfigService;
      service = new PaymentSlipService(prisma, slipOk as any, { emitToStaff: jest.fn() } as any, config);
      prisma.payment.findUnique.mockResolvedValue(pending);
      prisma.payment.update.mockImplementation(({ data }: any) => Promise.resolve({ id: 'p', ...data }));
    });

    // ทดสอบ: ตรวจสลิปซ้ำแล้ว SlipOK ยังตรวจไม่ได้ และยังไม่ครบจำนวนครั้ง บิลต้องยังรอตรวจ นับครั้งเพิ่ม และเก็บเหตุผลล่าสุด
    // วิธี: บิล PENDING ตรวจไปแล้ว 1 ครั้ง + SlipOK ตอบ unavailable → recheck() → เช็กว่าไม่เปลี่ยน slipStatus, slipAttempts เป็น 2 และ slipMessage เป็นเหตุผลล่าสุด
    it('ยังตรวจไม่ได้ และยังไม่ครบจำนวนครั้ง → ยังรอตรวจ นับครั้งเพิ่ม เก็บเหตุผลล่าสุด', async () => {
      slipOk.check.mockResolvedValue({ kind: 'unavailable', code: 1009, message: 'down' });
      const updated: any = await service.recheck('p');
      expect(updated.slipStatus).toBeUndefined(); // ไม่แตะสถานะ = ยัง PENDING
      expect(updated.slipAttempts).toBe(2);
      expect(updated.slipMessage).toBe('down');
    });

    // ทดสอบ: ตรวจซ้ำแล้วรอบนี้ผ่าน บิลต้องเป็น VERIFIED พร้อมรหัสรายการ ยอด และธนาคาร
    // วิธี: SlipOK ตอบ verified ยอดตรง → recheck() → เช็กฟิลด์ที่บันทึก, ตอนเช็กสลิปซ้ำไม่นับบิลตัวเอง และ update เฉพาะตอนบิลยัง PENDING
    it('รอบนี้ตรวจผ่าน → VERIFIED พร้อมรหัสรายการ ยอด และธนาคาร', async () => {
      slipOk.check.mockResolvedValue(verified());
      const updated: any = await service.recheck('p');
      expect(updated).toMatchObject({
        slipStatus: SlipStatus.VERIFIED, slipTransRef: 'T9', slipSendingBank: '004', slipMessage: 'ตรวจผ่าน (ตรวจซ้ำ)',
      });
      expect(updated.slipAmount.equals(D(100))).toBe(true);
      // เช็กสลิปซ้ำโดยไม่นับบิลตัวเอง และอัปเดตเฉพาะตอนยัง PENDING (กันชนกับ ADMIN ยืนยันเอง)
      expect(prisma.payment.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: { slipTransRef: 'T9', id: { not: 'p' } } }),
      );
      expect(prisma.payment.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'p', slipStatus: SlipStatus.PENDING } }),
      );
    });

    // ทดสอบ: SlipOK บอกว่าสลิปผ่าน แต่ยอดในสลิปไม่ตรงยอดบิล ต้องเป็น FAILED พร้อมเหตุผล
    // วิธี: SlipOK ตอบ verified ยอด 90 กับบิล 100 → recheck() → เช็ก slipStatus FAILED และข้อความบอกทั้งสองยอด
    it('SlipOK บอกผ่าน แต่ยอดไม่ตรงบิล → FAILED พร้อมเหตุผล', async () => {
      slipOk.check.mockResolvedValue(verified({ amount: 90 }));
      const updated: any = await service.recheck('p');
      expect(updated.slipStatus).toBe(SlipStatus.FAILED);
      expect(updated.slipMessage).toMatch(/ยอดในสลิป 90\.00 ไม่ตรงกับยอดที่เก็บ 100\.00/);
    });

    // ทดสอบ: SlipOK บอกว่าสลิปผ่าน แต่โอนก่อนเปิดโต๊ะ (สลิปของรายการอื่น) ต้องเป็น FAILED
    // วิธี: SlipOK ตอบ verified เวลาโอนเมื่อวาน → recheck() → เช็ก FAILED และข้อความ "โอนก่อนเปิดโต๊ะ"
    it('SlipOK บอกผ่าน แต่โอนก่อนเปิดโต๊ะ → FAILED', async () => {
      slipOk.check.mockResolvedValue(verified({ transAt: new Date(Date.now() - 24 * 60 * 60_000) }));
      const updated: any = await service.recheck('p');
      expect(updated.slipStatus).toBe(SlipStatus.FAILED);
      expect(updated.slipMessage).toMatch(/โอนก่อนเปิดโต๊ะ/);
    });

    // ทดสอบ: SlipOK บอกว่าสลิปผ่าน แต่มีบิลอื่นใช้สลิปนี้ไปแล้ว ต้องเป็น FAILED
    // วิธี: SlipOK ตอบ verified + มีบิลอื่นที่ใช้รหัสรายการเดียวกัน → recheck() → เช็ก FAILED และข้อความบอกเลขใบเสร็จของบิลนั้น
    it('SlipOK บอกผ่าน แต่สลิปนี้มีบิลอื่นใช้อยู่แล้ว → FAILED', async () => {
      slipOk.check.mockResolvedValue(verified());
      prisma.payment.findFirst.mockResolvedValue({ id: 'other', receipt: { number: 'RCPT-9' } });
      const updated: any = await service.recheck('p');
      expect(updated.slipStatus).toBe(SlipStatus.FAILED);
      expect(updated.slipMessage).toMatch(/ใบเสร็จ RCPT-9/);
    });

    // ทดสอบ: ตรวจซ้ำแล้ว SlipOK ปฏิเสธสลิป ต้องเป็น FAILED ด้วยข้อความจาก SlipOK
    // วิธี: SlipOK ตอบ rejected (1014 โอนผิดบัญชี) → recheck() → เช็ก slipStatus และ slipMessage
    it('SlipOK ปฏิเสธ → FAILED ด้วยข้อความจาก SlipOK', async () => {
      slipOk.check.mockResolvedValue({ kind: 'rejected', code: 1014, message: 'ไม่ได้โอนเข้าบัญชีของร้าน' });
      const updated: any = await service.recheck('p');
      expect(updated).toMatchObject({ slipStatus: SlipStatus.FAILED, slipMessage: 'ไม่ได้โอนเข้าบัญชีของร้าน' });
    });

    // ทดสอบ: สองบิลตรวจสลิปใบเดียวกันพร้อมกัน บิลที่บันทึกทีหลังต้องเป็น FAILED และไม่เก็บรหัสรายการซ้ำ
    // วิธี: SlipOK ตอบ verified แต่ update ครั้งแรกชน unique (P2002) → recheck() → เช็กว่าบันทึกใหม่เป็น FAILED "ถูกใช้กับบิลอื่นแล้ว" นับครั้งเพิ่ม และไม่มี slipTransRef
    it('สองบิลใช้สลิปเดียวกันพร้อมกัน: บิลอื่นบันทึกรหัสรายการไปก่อน (unique ชน) → บิลนี้ FAILED', async () => {
      slipOk.check.mockResolvedValue(verified());
      prisma.payment.update
        .mockRejectedValueOnce(known('P2002'))
        .mockImplementationOnce(({ data }: any) => Promise.resolve({ id: 'p', ...data }));
      const updated: any = await service.recheck('p');
      expect(updated).toMatchObject({
        slipStatus: SlipStatus.FAILED, slipMessage: 'สลิปนี้ถูกใช้กับบิลอื่นแล้ว', slipAttempts: 2,
      });
      expect(updated.slipTransRef).toBeUndefined();
    });

    // ทดสอบ: ADMIN กดยืนยันเองไประหว่างที่ระบบกำลังตรวจซ้ำ ระบบต้องไม่เขียนทับผลของ ADMIN
    // วิธี: SlipOK ตอบ verified แต่ update ไม่เจอบิลที่ยัง PENDING (P2025) → recheck() ต้อง throw ConflictException และ update แค่ครั้งเดียว
    it('ADMIN ยืนยันเองไประหว่างตรวจ (ไม่เป็น PENDING แล้ว) → 409 ไม่ทับผลของ ADMIN', async () => {
      slipOk.check.mockResolvedValue(verified());
      prisma.payment.update.mockRejectedValue(known('P2025'));
      await expect(service.recheck('p')).rejects.toBeInstanceOf(ConflictException);
      expect(prisma.payment.update).toHaveBeenCalledTimes(1);
    });

    // ทดสอบ: ตรวจซ้ำบิลที่ไม่มีอยู่ได้ 404 ส่วนบิลที่ไม่ได้รอตรวจ ถูกยกเลิก หรือไม่มีข้อมูลสลิป ได้ 409 และไม่เรียก SlipOK
    // วิธี: findUnique คืน null → 404 แล้วไล่บิล VERIFIED / VOIDED / ไม่มี slipPayload → แต่ละตัวต้อง ConflictException → เช็กว่าไม่เคยเรียก SlipOK
    it('ไม่พบบิล → 404 · บิลไม่ได้รอตรวจ / ถูกยกเลิก / ไม่มีข้อมูลสลิป → 409 และไม่เรียก SlipOK', async () => {
      prisma.payment.findUnique.mockResolvedValueOnce(null);
      await expect(service.recheck('p')).rejects.toBeInstanceOf(NotFoundException);
      for (const bad of [
        { slipStatus: SlipStatus.VERIFIED },
        { status: PaymentStatus.VOIDED },
        { slipPayload: null },
      ]) {
        prisma.payment.findUnique.mockResolvedValueOnce({ ...pending, ...bad });
        await expect(service.recheck('p')).rejects.toBeInstanceOf(ConflictException);
      }
      expect(slipOk.check).not.toHaveBeenCalled();
    });

    // ทดสอบ: รอบตรวจอัตโนมัติตรวจทุกบิลที่รอ และบิลหนึ่งพังต้องไม่หยุดบิลถัดไป
    // วิธี: มีบิลรอตรวจ a, b + recheck ของ a โยน error → recheckPending() → เช็กว่าเรียก recheck ครบทั้ง a และ b ตามลำดับ
    it('รอบอัตโนมัติ: ตรวจทุกบิลที่รอ บิลหนึ่งพังไม่หยุดบิลถัดไป', async () => {
      prisma.payment.findMany = jest.fn().mockResolvedValue([{ id: 'a' }, { id: 'b' }]);
      jest.spyOn(service, 'recheck').mockRejectedValueOnce(new Error('boom')).mockResolvedValueOnce({} as any);
      jest.spyOn((service as any).logger, 'warn').mockImplementation(() => undefined);
      await service.recheckPending();
      expect(service.recheck).toHaveBeenNthCalledWith(1, 'a');
      expect(service.recheck).toHaveBeenNthCalledWith(2, 'b');
    });
  });
});
