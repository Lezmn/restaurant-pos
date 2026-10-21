import { BadRequestException, ConflictException } from '@nestjs/common';
import { PaymentMethod, Prisma, Role } from '@prisma/client';
import { CashClosesService } from './cash-closes.service';

const D = (v: number) => new Prisma.Decimal(v);
const user = { id: 'u1', email: 'e', name: 'แคชเชียร์', role: Role.STAFF };

const todayKey = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

function makePrisma() {
  return {
    payment: { groupBy: jest.fn().mockResolvedValue([]) },
    expense: {
      aggregate: jest.fn().mockResolvedValue({ _sum: { amount: null } }),
      findMany: jest.fn().mockResolvedValue([]),
    },
    order: { groupBy: jest.fn().mockResolvedValue([]) },
    dailyCashClose: {
      create: jest.fn(({ data }: any) => Promise.resolve({ id: 'cc1', ...data })),
      findUnique: jest.fn().mockResolvedValue(null),
      findFirst: jest.fn().mockResolvedValue(null),
      findMany: jest.fn().mockResolvedValue([]),
      delete: jest.fn(),
    },
  } as any;
}

describe('CashClosesService', () => {
  let prisma: ReturnType<typeof makePrisma>;
  let service: CashClosesService;

  beforeEach(() => {
    prisma = makePrisma();
    service = new CashClosesService(prisma);
    prisma.payment.groupBy.mockResolvedValue([
      { method: PaymentMethod.CASH, _sum: { amount: D(1250.5) }, _count: { _all: 4 } },
      { method: PaymentMethod.PROMPTPAY, _sum: { amount: D(800) }, _count: { _all: 2 } },
    ]);
    prisma.expense.aggregate.mockResolvedValue({ _sum: { amount: D(120.25) } });
  });

  it('expectedCash = เงินทอนตั้งต้น + ขายเงินสด − หยิบจ่ายจากลิ้นชัก; difference = นับได้ − expected', async () => {
    const result: any = await service.create({ openingFloat: 1000, countedCash: 2100 }, user);
    expect(Number(result.cashSales)).toBe(1250.5);
    expect(Number(result.drawerExpenses)).toBe(120.25);
    expect(Number(result.expectedCash)).toBe(2130.25);
    expect(Number(result.difference)).toBe(-30.25);
    expect(Number(result.promptpaySales)).toBe(800); // PromptPay ไม่นับในลิ้นชัก
    expect(result.date).toBe(todayKey());
    expect(result.closedByName).toBe('แคชเชียร์');
  });

  it('นับเกิน → difference เป็นบวก', async () => {
    const result: any = await service.create({ openingFloat: 0, countedCash: 1200 }, user);
    expect(Number(result.difference)).toBeCloseTo(1200 - (1250.5 - 120.25), 2);
  });

  it('วันไม่มียอดเลย → ทุกอย่างเป็น 0', async () => {
    prisma.payment.groupBy.mockResolvedValue([]);
    prisma.expense.aggregate.mockResolvedValue({ _sum: { amount: null } });
    const result: any = await service.create({ openingFloat: 500, countedCash: 500 }, user);
    expect(Number(result.expectedCash)).toBe(500);
    expect(Number(result.difference)).toBe(0);
  });

  it('ยอดขายนับเฉพาะบิล COMPLETED ในช่วงวันเวลาไทย [00:00, 24:00)', async () => {
    await service.create({ date: '2026-10-16', openingFloat: 0, countedCash: 0 }, user);
    const where = prisma.payment.groupBy.mock.calls[0][0].where;
    expect(where.status).toBe('COMPLETED');
    // 2026-10-16 00:00 เวลาไทย = 2026-10-15T17:00Z
    expect(where.paidAt.gte.toISOString()).toBe('2026-10-15T17:00:00.000Z');
    expect(where.paidAt.lt.toISOString()).toBe('2026-10-16T17:00:00.000Z');
  });

  it('ปิดยอดล่วงหน้า → 400', async () => {
    await expect(
      service.create({ date: '2999-01-01', openingFloat: 0, countedCash: 0 }, user),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('วันที่ไม่มีจริง (30 ก.พ.) → 400', async () => {
    await expect(
      service.create({ date: '2026-02-30', openingFloat: 0, countedCash: 0 }, user),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('ปิดยอดซ้ำวันเดิม → 409', async () => {
    prisma.dailyCashClose.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('dup', { code: 'P2002', clientVersion: 'x' }),
    );
    await expect(service.create({ openingFloat: 0, countedCash: 0 }, user)).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('preview: แนะนำเงินทอนตั้งต้นจากการปิดยอดครั้งก่อน และนับโต๊ะค้างจ่าย', async () => {
    prisma.dailyCashClose.findFirst.mockResolvedValue({ openingFloat: D(1500) });
    prisma.order.groupBy.mockResolvedValue([{ tableId: 'a' }, { tableId: 'b' }]);
    const result: any = await service.preview();
    expect(Number(result.suggestedOpeningFloat)).toBe(1500);
    expect(result.unpaidTableCount).toBe(2);
    expect(result.paymentCount).toBe(6);
    expect(result.alreadyClosed).toBeNull();
  });

  it('findOne: ยอดเปลี่ยนหลังปิด (ยกเลิกบิลทีหลัง) → changedSinceClose = true', async () => {
    prisma.dailyCashClose.findUnique.mockResolvedValue({
      id: 'cc1',
      date: '2026-10-16',
      cashSales: D(2000),
      drawerExpenses: D(120.25),
      promptpaySales: D(800),
    });
    const result: any = await service.findOne('cc1');
    expect(result.changedSinceClose).toBe(true);
  });

  it('findAll ตามเดือน: ธันวาคมข้ามปีถูกต้อง', async () => {
    await service.findAll({ month: '2026-12' });
    expect(prisma.dailyCashClose.findMany.mock.calls[0][0].where).toEqual({
      date: { gte: '2026-12-01', lt: '2027-01-01' },
    });
  });
});
