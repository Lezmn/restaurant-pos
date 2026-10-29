import {
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import {
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
 * จ่ายทั้งโต๊ะ, error ของ transaction, findAll/findOne, ยกเลิกบิลกรณีพิเศษ
 * (ระบบไม่มีการหารบิล / แยกบิล จึงไม่มีเทสต์ของส่วนนั้น)
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

describe('PaymentsService — จ่ายทั้งโต๊ะ', () => {
  it('ไม่พบ session ตอนจ่ายทั้งโต๊ะ → 404', async () => {
    const { service, prisma } = setup();
    prisma.tableSession.findUnique.mockResolvedValue(null);
    await expect(service.create(cash({ tableSessionId: 'x' }), staff)).rejects.toBeInstanceOf(NotFoundException);
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
