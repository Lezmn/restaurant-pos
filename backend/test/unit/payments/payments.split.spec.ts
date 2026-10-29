import {
  BadRequestException,
  ConflictException,
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
import { AuthenticatedUser } from '../../../src/auth/jwt.strategy';
import { PaymentsService } from '../../../src/payments/payments.service';

/**
 * ส่วนของ PaymentsService ที่ payments.service.spec.ts ยังไม่ครอบ:
 * หารเท่ากัน, เลือกออเดอร์/เลือกรายการ, PromptPay แต่ละแบบ, error ของ transaction, ยกเลิกบิลที่หาร
 */
const D = (v: number | string) => new Prisma.Decimal(v);
const staff: AuthenticatedUser = { id: 'u-staff', email: 's@x', name: 'Staff', role: Role.STAFF };
const prismaError = (code: string, meta?: Record<string, unknown>) =>
  new Prisma.PrismaClientKnownRequestError('x', { code, clientVersion: 't', meta });

function order(id: string, price: number, overrides: Record<string, unknown> = {}) {
  return {
    id,
    status: OrderStatus.SERVED,
    tableSessionId: 'sess-1',
    tableId: 'table-1',
    paymentId: null,
    tableSession: { isTakeaway: false },
    items: [
      {
        id: `${id}-i`,
        quantity: 1,
        unitPrice: D(price),
        note: null,
        customName: null,
        menuItem: { name: `เมนู ${id}` },
        selectedOptions: [],
      },
    ],
    ...overrides,
  };
}

function setup() {
  const prisma: any = {
    order: {
      findMany: jest.fn().mockResolvedValue([]),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      count: jest.fn().mockResolvedValue(0),
      create: jest.fn(),
    },
    orderItem: { findMany: jest.fn(), updateMany: jest.fn(), create: jest.fn() },
    payment: {
      create: jest.fn(async ({ data }: any) => ({ id: 'pay-1', ...data })),
      findUnique: jest.fn(),
      findMany: jest.fn().mockResolvedValue([]),
      update: jest.fn(async ({ data }: any) => ({ id: 'pay-1', ...data })),
    },
    receipt: {
      create: jest.fn(async ({ data }: any) => ({ id: 'rc-1', ...data, items: data.items.create })),
      count: jest.fn().mockResolvedValue(0),
    },
    tableSession: {
      findUnique: jest.fn().mockResolvedValue({ id: 'sess-1', isTakeaway: false }),
      findUniqueOrThrow: jest.fn().mockResolvedValue({ openedAt: new Date() }),
      findMany: jest.fn().mockResolvedValue([]),
      findFirst: jest.fn().mockResolvedValue(null),
      update: jest.fn().mockResolvedValue({}),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    restaurantTable: { update: jest.fn() },
    serviceRequest: { updateMany: jest.fn() },
    dailyCashClose: { findUnique: jest.fn().mockResolvedValue(null) },
    billSplit: {
      findMany: jest.fn().mockResolvedValue([]),
      findFirst: jest.fn().mockResolvedValue(null),
      findUnique: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue({ id: 'split-1' }),
      update: jest.fn(),
      delete: jest.fn(),
    },
    $executeRaw: jest.fn(),
  };
  prisma.$transaction = jest.fn((fn: (tx: unknown) => unknown) => fn(prisma));
  const events: any = { emitToStaff: jest.fn(), emitToSession: jest.fn() };
  const slip: any = {
    checkForNewPayment: jest.fn().mockResolvedValue({ slipStatus: SlipStatus.VERIFIED, slipTransRef: 'T1' }),
    releaseOnVoid: jest.fn().mockReturnValue({}),
  };
  return { prisma, events, slip, service: new PaymentsService(prisma, events, slip) };
}

const cash = (extra: Record<string, unknown>) => ({ method: PaymentMethod.CASH, ...extra }) as any;

describe('PaymentsService — เป้าหมายการเก็บเงิน', () => {
  it.each([
    [{ items: [{ orderItemId: 'a', quantity: 1 }], orderIds: ['o1'] }, /อย่างใดอย่างหนึ่ง/],
    [{ orderIds: ['o1'], splitParts: 2 }, /เฉพาะทั้งโต๊ะ/],
    [{ splitParts: 2, items: [{ orderItemId: 'a', quantity: 1 }] }, /เฉพาะทั้งโต๊ะ/],
    [{ tableSessionId: 's', orderIds: ['o1'], splitParts: 2 }, /เฉพาะทั้งโต๊ะ/],
  ])('%j → 400', async (dto, msg) => {
    const { service, prisma } = setup();
    await expect(service.create(cash(dto), staff)).rejects.toThrow(msg);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});

describe('PaymentsService — เลือกออเดอร์ (แยกบิล/รวมบิลข้ามโต๊ะ)', () => {
  it('รวมบิลสองโต๊ะ: บิลผูก session ของออเดอร์แรก และแจ้งลูกค้าทั้งสองโต๊ะ', async () => {
    const { service, prisma, events } = setup();
    prisma.order.findMany.mockResolvedValue([
      order('o1', 100),
      order('o2', 50, { tableSessionId: 'sess-2', tableId: 'table-2' }),
    ]);
    prisma.order.updateMany.mockResolvedValue({ count: 2 });
    const res: any = await service.create(cash({ orderIds: ['o1', 'o2', 'o1'] }), staff);

    expect(prisma.order.findMany.mock.calls[0][0].where).toEqual({ id: { in: ['o1', 'o2'] } });
    expect(Number(res.amount)).toBe(150);
    expect(res.tableSessionId).toBe('sess-1');
    expect(res.closedSessionIds).toEqual(['sess-1', 'sess-2']);
    expect(events.emitToSession.mock.calls.map((c: unknown[]) => c[0])).toEqual(['sess-1', 'sess-2']);
    // payload ฝั่งลูกค้าไม่มีรายการอาหารของอีกโต๊ะ
    expect(events.emitToSession.mock.calls[1][2]).toEqual({ id: 'pay-1', tableSessionId: 'sess-2', sessionClosed: true });
  });

  it('ยังมีออเดอร์ค้างใน session → ไม่ปิดโต๊ะ', async () => {
    const { service, prisma } = setup();
    prisma.order.findMany.mockResolvedValue([order('o1', 100)]);
    prisma.order.count.mockResolvedValue(2);
    const res: any = await service.create(cash({ orderIds: ['o1'] }), staff);
    expect(res.closedSessionIds).toEqual([]);
  });

  it.each([
    ['ไม่พบออเดอร์', [], NotFoundException],
    ['ออเดอร์ไม่มี session', [order('o1', 1, { tableSessionId: null })], BadRequestException],
    ['จ่ายไปแล้ว', [order('o1', 1, { paymentId: 'p0' })], ConflictException],
    ['สถานะ PAID', [order('o1', 1, { status: OrderStatus.PAID })], ConflictException],
    ['ยังไม่เสิร์ฟ', [order('o1', 1, { status: OrderStatus.PREPARING })], BadRequestException],
  ])('%s → error', async (_l, orders, Err) => {
    const { service, prisma } = setup();
    prisma.order.findMany.mockResolvedValue(orders);
    await expect(service.create(cash({ orderIds: ['o1'] }), staff)).rejects.toBeInstanceOf(Err);
    expect(prisma.payment.create).not.toHaveBeenCalled();
  });

  it('ไม่พบ session ตอนจ่ายทั้งโต๊ะ → 404', async () => {
    const { service, prisma } = setup();
    prisma.tableSession.findUnique.mockResolvedValue(null);
    await expect(service.create(cash({ tableSessionId: 'x' }), staff)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('จ่ายทั้งโต๊ะที่กำลังหารอยู่แต่ยังไม่มีใครจ่าย → ยกเลิกการหารทิ้งก่อน', async () => {
    const { service, prisma } = setup();
    prisma.order.findMany.mockResolvedValue([order('o1', 100)]);
    prisma.billSplit.findMany.mockResolvedValue([{ id: 'split-0', parts: 2, payments: [] }]);
    await service.create(cash({ tableSessionId: 'sess-1' }), staff);
    expect(prisma.billSplit.delete).toHaveBeenCalledWith({ where: { id: 'split-0' } });
  });
});

describe('PaymentsService — เลือกรายการ (items)', () => {
  const selectedItem = {
    id: 'a',
    orderId: 'o1',
    quantity: 2,
    unitPrice: D(40),
    menuItemId: 'm1',
    customName: null,
    note: null,
    selectedOptions: [],
    order: {
      id: 'o1',
      tableId: 'table-1',
      tableSessionId: 'sess-1',
      status: OrderStatus.SERVED,
      paymentId: null,
      createdAt: new Date(),
      clearedAt: null,
      items: [{ id: 'a', quantity: 2 }],
    },
  };

  it('ย้ายรายการที่เลือกไปออเดอร์ใหม่ แล้วเก็บเงินออเดอร์นั้น (ไม่ยกเลิกการหารซ้ำ)', async () => {
    const { service, prisma } = setup();
    prisma.orderItem.findMany.mockResolvedValue([selectedItem]);
    prisma.orderItem.updateMany.mockResolvedValue({ count: 1 });
    prisma.order.create.mockResolvedValue({ id: 'carved' });
    prisma.order.findMany.mockResolvedValue([order('carved', 40)]);
    const res: any = await service.create(cash({ items: [{ orderItemId: 'a', quantity: 1 }] }), staff);
    expect(prisma.order.findMany.mock.calls[0][0].where).toEqual({ id: { in: ['carved'] } });
    expect(Number(res.amount)).toBe(40);
    // releaseUnpaidSplits ถูกเรียกครั้งเดียวใน carveOutItems ไม่ใช่สองรอบ
    expect(prisma.billSplit.findMany).toHaveBeenCalledTimes(1);
  });

  it('PromptPay เลือกรายการ: ตรวจสลิปด้วยยอดของรายการที่เลือก (หลังส่วนลด)', async () => {
    const { service, prisma, slip } = setup();
    prisma.orderItem.findMany.mockResolvedValue([selectedItem]);
    prisma.orderItem.updateMany.mockResolvedValue({ count: 1 });
    prisma.order.create.mockResolvedValue({ id: 'carved' });
    prisma.order.findMany.mockResolvedValue([order('carved', 40)]);
    await service.create(
      {
        method: PaymentMethod.PROMPTPAY,
        items: [{ orderItemId: 'a', quantity: 1 }],
        discountPercent: 50,
        slipPayload: 'qr',
      } as any,
      staff,
    );
    expect(slip.checkForNewPayment.mock.calls[0][0].charged.toString()).toBe('20');
    expect(prisma.payment.create.mock.calls[0][0].data.slipTransRef).toBe('T1');
  });

  it('PromptPay เลือกรายการ: ยอดบนจอไม่ตรง → 409 ก่อนเรียก SlipOK', async () => {
    const { service, prisma, slip } = setup();
    prisma.orderItem.findMany.mockResolvedValue([selectedItem]);
    await expect(
      service.create(
        { method: PaymentMethod.PROMPTPAY, items: [{ orderItemId: 'a', quantity: 1 }], expectedTotal: 99 } as any,
        staff,
      ),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(slip.checkForNewPayment).not.toHaveBeenCalled();
  });

  it('PromptPay เลือกออเดอร์: ตรวจสลิปด้วยยอดของออเดอร์ที่เลือก', async () => {
    const { service, prisma, slip } = setup();
    prisma.order.findMany.mockResolvedValue([order('o1', 70)]);
    await service.create({ method: PaymentMethod.PROMPTPAY, orderIds: ['o1'], slipPayload: 'qr' } as any, staff);
    expect(slip.checkForNewPayment.mock.calls[0][0].charged.toString()).toBe('70');
  });
});

describe('PaymentsService — หารเท่ากัน (splitParts)', () => {
  it('คนแรก: ล็อก session, สร้าง BillSplit ล็อกยอดหลังส่วนลด, เก็บส่วนแรก แต่ยังไม่ผูก/ปิดออเดอร์', async () => {
    const { service, prisma } = setup();
    prisma.order.findMany.mockResolvedValue([order('o1', 100)]);
    const res: any = await service.create(cash({ tableSessionId: 'sess-1', splitParts: 3, discountPercent: 10 }), staff);

    expect(prisma.$executeRaw).toHaveBeenCalled(); // advisory lock
    const created = prisma.billSplit.create.mock.calls[0][0].data;
    expect(created).toMatchObject({ parts: 3, discountPercent: 10, tableSessionId: 'sess-1' });
    expect(created.total.toString()).toBe('90');
    expect(created.orders).toEqual({ connect: [{ id: 'o1' }] });

    expect(res.amount.toString()).toBe('30');
    expect(res.billSplitId).toBe('split-1');
    expect(res.splitPart).toBe(1);
    expect(res.receipt).toMatchObject({ splitPart: 1, splitParts: 3 });
    expect(res.paidOrderIds).toEqual([]);
    expect(res.closedSessionIds).toEqual([]);
    expect(prisma.order.updateMany).not.toHaveBeenCalled();
    expect(prisma.billSplit.update).not.toHaveBeenCalled();
  });

  it('หาร 1 คน = จ่ายครบทันที ปิดการหาร', async () => {
    const { service, prisma } = setup();
    prisma.order.findMany.mockResolvedValue([order('o1', 100)]);
    const res: any = await service.create(cash({ tableSessionId: 'sess-1', splitParts: 1 }), staff);
    expect(res.amount.toString()).toBe('100');
    expect(prisma.billSplit.update).toHaveBeenCalledWith({
      where: { id: 'split-1' },
      data: { status: BillSplitStatus.DONE },
    });
  });

  const openSplit = (payments: string[], extra: Record<string, unknown> = {}) => ({
    id: 'split-1',
    parts: 3,
    subtotal: D(100),
    discount: D(0),
    discountPercent: null,
    total: D(100),
    payments: payments.map((a) => ({ amount: D(a) })),
    ...extra,
  });

  it('คนกลาง: ใช้ยอดที่ล็อกไว้ ไม่ผูกออเดอร์', async () => {
    const { service, prisma } = setup();
    prisma.billSplit.findFirst.mockResolvedValue(openSplit(['33.33']));
    prisma.order.findMany.mockResolvedValue([order('o1', 100)]);
    const res: any = await service.create(cash({ tableSessionId: 'sess-1', splitParts: 3 }), staff);
    expect(prisma.order.findMany.mock.calls[0][0].where).toEqual({
      billSplitId: 'split-1',
      paymentId: null,
      status: OrderStatus.SERVED,
    });
    expect(res.amount.toString()).toBe('33.33');
    expect(res.splitPart).toBe(2);
    expect(prisma.billSplit.create).not.toHaveBeenCalled();
  });

  it('คนสุดท้าย: จ่ายส่วนที่เหลือ (รวมเศษ) ผูกออเดอร์เป็น PAID ปิดโต๊ะ และปิดการหาร', async () => {
    const { service, prisma } = setup();
    prisma.billSplit.findFirst.mockResolvedValue(openSplit(['33.33', '33.33']));
    prisma.order.findMany.mockResolvedValue([order('o1', 100)]);
    const res: any = await service.create(cash({ tableSessionId: 'sess-1', splitParts: 3 }), staff);
    expect(res.amount.toString()).toBe('33.34');
    expect(res.paidOrderIds).toEqual(['o1']);
    expect(res.closedSessionIds).toEqual(['sess-1']);
    expect(prisma.billSplit.update).toHaveBeenCalledWith({
      where: { id: 'split-1' },
      data: { status: BillSplitStatus.DONE },
    });
  });

  it('มีคนจ่ายแล้ว แต่ขอเปลี่ยนจำนวนคน → 409', async () => {
    const { service, prisma } = setup();
    prisma.billSplit.findFirst.mockResolvedValue(openSplit(['33.33']));
    await expect(service.create(cash({ tableSessionId: 'sess-1', splitParts: 4 }), staff)).rejects.toThrow(
      /หารจ่าย 3 คนอยู่ \(จ่ายแล้ว 1 คน\)/,
    );
  });

  it('ยังไม่มีใครจ่าย แล้วเปลี่ยนจำนวนคน/ส่วนลด → ทิ้งการหารเดิม เริ่มใหม่', async () => {
    const { service, prisma } = setup();
    prisma.billSplit.findFirst.mockResolvedValue(openSplit([]));
    // splitOrderIds → releaseUnpaidSplits → resolveUnpaidSessionOrders
    prisma.order.findMany.mockResolvedValueOnce([{ id: 'o1' }]).mockResolvedValue([order('o1', 100)]);
    prisma.billSplit.findMany.mockResolvedValue([{ id: 'split-1', parts: 3, payments: [] }]);
    prisma.billSplit.create.mockResolvedValue({ id: 'split-2' });

    const res: any = await service.create(cash({ tableSessionId: 'sess-1', splitParts: 2 }), staff);
    expect(prisma.billSplit.delete).toHaveBeenCalledWith({ where: { id: 'split-1' } });
    expect(res.billSplitId).toBe('split-2');
    expect(res.amount.toString()).toBe('50');
  });

  it.each([
    ['ออเดอร์ในชุดถูกยกเลิกหมด', []],
    ['ยอดของชุดเปลี่ยนจากตอนล็อก', [order('o1', 80)]],
  ])('%s หลังมีคนจ่าย → 409', async (_l, orders) => {
    const { service, prisma } = setup();
    prisma.billSplit.findFirst.mockResolvedValue(openSplit(['33.33']));
    prisma.order.findMany.mockResolvedValue(orders);
    await expect(service.create(cash({ tableSessionId: 'sess-1', splitParts: 3 }), staff)).rejects.toThrow(
      /เปลี่ยนไปหลังมีคนจ่ายแล้ว/,
    );
  });

  it('PromptPay คนถัดไป: ตรวจสลิปด้วยยอดส่วนของคนนั้น โดยไม่สร้าง/ล็อกอะไรตอนตรวจ', async () => {
    const { service, prisma, slip } = setup();
    prisma.billSplit.findFirst.mockResolvedValue(openSplit(['33.33']));
    prisma.order.findMany.mockResolvedValue([order('o1', 100)]);
    await service.create(
      { method: PaymentMethod.PROMPTPAY, tableSessionId: 'sess-1', splitParts: 3, slipPayload: 'qr' } as any,
      staff,
    );
    expect(slip.checkForNewPayment.mock.calls[0][0].charged.toString()).toBe('33.33');
    // lock ครั้งเดียวตอนบันทึกจริง
    expect(prisma.$executeRaw).toHaveBeenCalledTimes(2); // split lock + receipt-number lock
  });

  it('PromptPay คนแรก: ตอนตรวจสลิปยังไม่สร้าง BillSplit', async () => {
    const { service, prisma, slip } = setup();
    prisma.order.findMany.mockResolvedValue([order('o1', 100)]);
    slip.checkForNewPayment.mockImplementation(async () => {
      expect(prisma.billSplit.create).not.toHaveBeenCalled();
      return { slipStatus: SlipStatus.VERIFIED };
    });
    await service.create(
      { method: PaymentMethod.PROMPTPAY, tableSessionId: 'sess-1', splitParts: 2, slipPayload: 'qr' } as any,
      staff,
    );
    expect(prisma.billSplit.create).toHaveBeenCalledTimes(1);
  });
});

describe('PaymentsService — transaction errors', () => {
  it('สลิปเดียวกันถูกบันทึกกับอีกบิลพร้อมกัน (unique slipTransRef) → 409', async () => {
    const { service, prisma } = setup();
    prisma.$transaction.mockRejectedValue(prismaError('P2002', { target: ['slipTransRef'] }));
    await expect(service.create(cash({ tableSessionId: 'sess-1' }), staff)).rejects.toThrow('สลิปนี้ถูกใช้กับบิลอื่นแล้ว');
  });

  it('transaction timeout (P2028) → 503 ให้กดใหม่ได้', async () => {
    const { service, prisma } = setup();
    prisma.$transaction.mockRejectedValue(prismaError('P2028'));
    await expect(service.create(cash({ tableSessionId: 'sess-1' }), staff)).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });

  it('unique อื่น / error อื่น → โยนต่อ', async () => {
    const { service, prisma } = setup();
    const other = prismaError('P2002', { target: ['number'] });
    prisma.$transaction.mockRejectedValue(other);
    await expect(service.create(cash({ tableSessionId: 'sess-1' }), staff)).rejects.toBe(other);
  });

  it('ใช้ timeout ที่ยาวกว่าค่า default ของ Prisma', async () => {
    const { service, prisma } = setup();
    prisma.order.findMany.mockResolvedValue([order('o1', 1)]);
    await service.create(cash({ tableSessionId: 'sess-1' }), staff);
    expect(prisma.$transaction.mock.calls[0][1]).toEqual({ maxWait: 10_000, timeout: 15_000 });
  });
});

describe('PaymentsService — findAll / findOne', () => {
  it('กรองช่วงเวลา + เฉพาะบิลที่สลิปมีปัญหา', async () => {
    const { service, prisma } = setup();
    await service.findAll({ from: '2026-05-01', to: '2026-05-02', slipIssues: true } as any);
    expect(prisma.payment.findMany.mock.calls[0][0].where).toEqual({
      paidAt: { gte: new Date('2026-05-01'), lt: new Date('2026-05-02') },
      status: PaymentStatus.COMPLETED,
      slipStatus: { in: [SlipStatus.AWAITING, SlipStatus.PENDING, SlipStatus.FAILED] },
    });
  });

  it('ไม่ส่ง filter = ทั้งหมด', async () => {
    const { service, prisma } = setup();
    await service.findAll();
    expect(prisma.payment.findMany.mock.calls[0][0].where).toEqual({ paidAt: {} });
  });

  it('findOne ไม่พบ → 404 / พบ → คืนพร้อมใบเสร็จ', async () => {
    const { service, prisma } = setup();
    prisma.payment.findUnique.mockResolvedValueOnce(null).mockResolvedValueOnce({ id: 'p1' });
    await expect(service.findOne('x')).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.findOne('p1')).resolves.toEqual({ id: 'p1' });
  });
});

describe('PaymentsService — ยกเลิกบิล (กรณีพิเศษ)', () => {
  const payment = (extra: Record<string, unknown> = {}) => ({
    id: 'pay-1',
    status: PaymentStatus.COMPLETED,
    paidAt: new Date(),
    slipTransRef: null,
    billSplitId: null,
    orders: [{ id: 'o1', tableSessionId: 'sess-1' }],
    ...extra,
  });

  it('ยกเลิกส่วนก่อนหน้าของบิลที่หารจ่ายครบแล้ว → 409', async () => {
    const { service, prisma } = setup();
    prisma.payment.findUnique.mockResolvedValue(payment({ billSplitId: 'split-1', orders: [] }));
    prisma.billSplit.findUnique.mockResolvedValue({ id: 'split-1', status: BillSplitStatus.DONE });
    await expect(service.voidPayment('pay-1', { reason: 'x' }, staff)).rejects.toThrow(/คนสุดท้ายก่อน/);
    expect(prisma.payment.update).not.toHaveBeenCalled();
  });

  it('ยกเลิกส่วนก่อนหน้าตอนบิลยังไม่ครบ → คืนเงินส่วนนั้น ไม่แตะออเดอร์/โต๊ะ', async () => {
    const { service, prisma } = setup();
    prisma.payment.findUnique.mockResolvedValue(payment({ billSplitId: 'split-1', orders: [] }));
    prisma.billSplit.findUnique.mockResolvedValue({ id: 'split-1', status: BillSplitStatus.OPEN });
    const res = await service.voidPayment('pay-1', { reason: 'x' }, staff);
    expect(res.reopenedSessionIds).toEqual([]);
    expect(prisma.billSplit.update).not.toHaveBeenCalled();
  });

  it('ยกเลิกส่วนสุดท้าย → เปิดการหารกลับ รับเงินคนสุดท้ายใหม่ได้', async () => {
    const { service, prisma } = setup();
    prisma.payment.findUnique.mockResolvedValue(payment({ billSplitId: 'split-1' }));
    prisma.billSplit.findUnique.mockResolvedValue({ id: 'split-1', status: BillSplitStatus.DONE });
    await service.voidPayment('pay-1', { reason: 'x' }, staff);
    expect(prisma.billSplit.update).toHaveBeenCalledWith({
      where: { id: 'split-1' },
      data: { status: BillSplitStatus.OPEN },
    });
  });

  it('บิลกลับบ้าน: เปิดบิลกลับได้แม้มีบิลกลับบ้านอื่นเปิดอยู่ และไม่แตะสถานะโต๊ะเสมือน', async () => {
    const { service, prisma } = setup();
    prisma.payment.findUnique.mockResolvedValue(payment());
    prisma.tableSession.findMany.mockResolvedValue([
      { id: 'sess-1', tableId: 'takeaway', isTakeaway: true, table: { number: 0 } },
    ]);
    prisma.tableSession.findUnique.mockResolvedValue({
      id: 'sess-1',
      status: TableSessionStatus.CLOSED,
      tableId: 'takeaway',
      isTakeaway: true,
    });
    await service.voidPayment('pay-1', { reason: 'x' }, staff);
    expect(prisma.tableSession.findFirst).not.toHaveBeenCalled();
    expect(prisma.restaurantTable.update).not.toHaveBeenCalled();
  });

  it('โต๊ะจริง: เปิด session กลับแล้วตั้งโต๊ะเป็นมีลูกค้า', async () => {
    const { service, prisma } = setup();
    prisma.payment.findUnique.mockResolvedValue(payment());
    prisma.tableSession.findUnique.mockResolvedValue({
      id: 'sess-1',
      status: TableSessionStatus.CLOSED,
      tableId: 'table-1',
      isTakeaway: false,
    });
    await service.voidPayment('pay-1', { reason: 'x' }, staff);
    expect(prisma.restaurantTable.update).toHaveBeenCalledWith({
      where: { id: 'table-1' },
      data: { status: TableStatus.OCCUPIED },
    });
  });

  it('session ยังเปิดอยู่ (เช่น จ่ายบางส่วน) → ไม่ต้องเปิดซ้ำ', async () => {
    const { service, prisma } = setup();
    prisma.payment.findUnique.mockResolvedValue(payment());
    prisma.tableSession.findUnique.mockResolvedValue({ id: 'sess-1', status: TableSessionStatus.OPEN });
    await service.voidPayment('pay-1', { reason: 'x' }, staff);
    expect(prisma.tableSession.update).not.toHaveBeenCalled();
  });

  it('มีเครื่องอื่นเปิดโต๊ะรอบใหม่แทรกเข้ามาพอดี (unique ชน) → 409', async () => {
    const { service, prisma } = setup();
    prisma.payment.findUnique.mockResolvedValue(payment());
    prisma.tableSession.findUnique.mockResolvedValue({
      id: 'sess-1',
      status: TableSessionStatus.CLOSED,
      tableId: 'table-1',
      isTakeaway: false,
    });
    prisma.tableSession.update.mockRejectedValue(prismaError('P2002'));
    await expect(service.voidPayment('pay-1', { reason: 'x' }, staff)).rejects.toThrow(/เพิ่งเปิดรับลูกค้ารอบใหม่/);
  });

  it('เปิด session กลับไม่ได้ด้วยเหตุอื่น → โยนต่อ', async () => {
    const { service, prisma } = setup();
    prisma.payment.findUnique.mockResolvedValue(payment());
    prisma.tableSession.findUnique.mockResolvedValue({ id: 'sess-1', status: TableSessionStatus.CLOSED });
    const err = new Error('db');
    prisma.tableSession.update.mockRejectedValue(err);
    await expect(service.voidPayment('pay-1', { reason: 'x' }, staff)).rejects.toBe(err);
  });

  it('ยกเลิกบิลที่มีสลิป → ปล่อยรหัสสลิปคืน และแจ้งลูกค้าโต๊ะนั้นแบบไม่แนบรายละเอียด', async () => {
    const { service, prisma, slip, events } = setup();
    prisma.payment.findUnique.mockResolvedValue(payment({ slipTransRef: 'T1' }));
    slip.releaseOnVoid.mockReturnValue({ slipTransRef: null });
    await service.voidPayment('pay-1', { reason: 'ผิดโต๊ะ' }, staff);
    expect(slip.releaseOnVoid).toHaveBeenCalledWith('T1');
    expect(prisma.payment.update.mock.calls[0][0].data).toMatchObject({
      status: PaymentStatus.VOIDED,
      voidReason: 'ผิดโต๊ะ',
      slipTransRef: null,
    });
    expect(events.emitToSession).toHaveBeenCalledWith('sess-1', 'payment.voided', {
      id: 'pay-1',
      tableSessionId: 'sess-1',
      sessionClosed: false,
    });
  });
});
