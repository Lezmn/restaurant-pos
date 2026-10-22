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
import { AuthenticatedUser } from '../auth/jwt.strategy';
import { EventsGateway } from '../events/events.gateway';
import { PrismaService } from '../prisma/prisma.service';
import { SlipOkService } from '../slipok/slipok.service';
import { PaymentSlipService } from './payment-slip.service';
import { PaymentsService } from './payments.service';
import { ConfigService } from '@nestjs/config';

const D = (v: number | string) => new Prisma.Decimal(v);

const staff: AuthenticatedUser = { id: 'u-staff', email: 's@x', name: 'Staff', role: Role.STAFF };
const admin: AuthenticatedUser = { id: 'u-admin', email: 'a@x', name: 'Admin', role: Role.ADMIN };

/** ออเดอร์ทรงเดียวกับ PAYABLE_ORDER_INCLUDE */
function order(
  id: string,
  items: { price: number; qty: number; options?: number[]; name?: string }[],
  overrides: Partial<{ status: OrderStatus; tableSessionId: string | null; tableId: string }> = {},
) {
  return {
    id,
    status: OrderStatus.SERVED,
    tableSessionId: 'sess-1',
    tableId: 'table-1',
    paymentId: null,
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

    it('ส่วนลด: เก็บน้อยกว่ายอดบิล → ส่วนต่างเป็น discount ในใบเสร็จ', async () => {
      prisma.order.findMany.mockResolvedValue(servedSessionOrders());
      prisma.order.updateMany.mockResolvedValue({ count: 2 });
      prisma.order.count.mockResolvedValue(0);
      const result: any = await service.create(
        { tableSessionId: 'sess-1', method: PaymentMethod.CASH, amount: 200 },
        staff,
      );
      expect(Number(result.receipt.subtotal)).toBe(235.5);
      expect(Number(result.receipt.discount)).toBe(35.5);
      expect(Number(result.receipt.total)).toBe(200);
      expect(Number(result.amount)).toBe(200);
    });

    it('เก็บเกินยอดบิล → 400 (เงินทอนไม่ใช่รายได้)', async () => {
      prisma.order.findMany.mockResolvedValue(servedSessionOrders());
      await expect(
        service.create({ tableSessionId: 'sess-1', method: PaymentMethod.CASH, amount: 300 }, staff),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.payment.create).not.toHaveBeenCalled();
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

    it('session ไม่มีออเดอร์ค้างจ่าย → 400', async () => {
      prisma.order.findMany.mockResolvedValue([]);
      await expect(
        service.create({ tableSessionId: 'sess-1', method: PaymentMethod.CASH }, staff),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('ไม่ส่งทั้ง tableSessionId และ orderIds → 400', async () => {
      await expect(service.create({ method: PaymentMethod.CASH } as any, staff)).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('แยกบิล: orderIds ที่ไม่มีอยู่ → 404', async () => {
      prisma.order.findMany.mockResolvedValue([order('o1', [{ price: 10, qty: 1 }])]);
      await expect(
        service.create({ orderIds: ['o1', 'o-missing'], method: PaymentMethod.CASH }, staff),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('แยกบิล: ออเดอร์ที่จ่ายไปแล้ว → 409, ยังไม่เสิร์ฟ → 400, ไม่มี session → 400', async () => {
      prisma.order.findMany.mockResolvedValueOnce([
        order('o1', [{ price: 10, qty: 1 }], { status: OrderStatus.PAID }),
      ]);
      await expect(
        service.create({ orderIds: ['o1'], method: PaymentMethod.CASH }, staff),
      ).rejects.toBeInstanceOf(ConflictException);

      prisma.order.findMany.mockResolvedValueOnce([
        order('o1', [{ price: 10, qty: 1 }], { status: OrderStatus.PENDING }),
      ]);
      await expect(
        service.create({ orderIds: ['o1'], method: PaymentMethod.CASH }, staff),
      ).rejects.toBeInstanceOf(BadRequestException);

      prisma.order.findMany.mockResolvedValueOnce([
        order('o1', [{ price: 10, qty: 1 }], { tableSessionId: null }),
      ]);
      await expect(
        service.create({ orderIds: ['o1'], method: PaymentMethod.CASH }, staff),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('แยกบิล: orderIds ซ้ำกันไม่ทำให้คิดเงินซ้ำ', async () => {
      prisma.order.findMany.mockResolvedValue([order('o1', [{ price: 40, qty: 1 }])]);
      prisma.order.updateMany.mockResolvedValue({ count: 1 });
      prisma.order.count.mockResolvedValue(0);
      const result: any = await service.create(
        { orderIds: ['o1', 'o1'], method: PaymentMethod.CASH },
        staff,
      );
      expect(Number(result.amount)).toBe(40);
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
      await expect(service.voidPayment('p', { reason: 'x' })).rejects.toBeInstanceOf(ConflictException);
    });

    it('ไม่พบบิล → 404', async () => {
      prisma.payment.findUnique.mockResolvedValue(null);
      await expect(service.voidPayment('p', { reason: 'x' })).rejects.toBeInstanceOf(NotFoundException);
    });

    it('โต๊ะเปิดรอบใหม่ไปแล้ว → 409 ไม่เปิด session เดิมซ้อน', async () => {
      prisma.payment.findUnique.mockResolvedValue({
        id: 'p',
        status: PaymentStatus.COMPLETED,
        orders: [{ id: 'o1', tableSessionId: 'sess-1' }],
      });
      prisma.tableSession.findMany.mockResolvedValue([
        { id: 'sess-1', tableId: 'table-1', table: { number: 3 } },
      ]);
      prisma.tableSession.findFirst.mockResolvedValue({ id: 'sess-2' });
      await expect(service.voidPayment('p', { reason: 'x' })).rejects.toBeInstanceOf(ConflictException);
      expect(prisma.payment.update).not.toHaveBeenCalled();
    });

    it('ยกเลิกสำเร็จ: คืนออเดอร์เป็น SERVED และเปิด session กลับ', async () => {
      prisma.payment.findUnique.mockResolvedValue({
        id: 'p',
        status: PaymentStatus.COMPLETED,
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
      const result = await service.voidPayment('p', { reason: 'จ่ายผิดโต๊ะ' });
      expect(result.reopenedSessionIds).toEqual(['sess-1']);
      expect(prisma.order.updateMany).toHaveBeenCalledWith({
        where: { paymentId: 'p' },
        data: { status: OrderStatus.SERVED, paymentId: null },
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

  it('ยืนยันเอง (confirmManually) ได้เฉพาะบิล PENDING/FAILED และเฉพาะ ADMIN', async () => {
    await expect(service.confirmManually('p', 'r', staff)).rejects.toBeInstanceOf(ForbiddenException);
    prisma.payment.findUnique.mockResolvedValue({ id: 'p', status: PaymentStatus.COMPLETED, slipStatus: SlipStatus.VERIFIED });
    await expect(service.confirmManually('p', 'r', admin)).rejects.toBeInstanceOf(ConflictException);
    prisma.payment.findUnique.mockResolvedValue({ id: 'p', status: PaymentStatus.VOIDED, slipStatus: SlipStatus.PENDING });
    await expect(service.confirmManually('p', 'r', admin)).rejects.toBeInstanceOf(ConflictException);
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
});
