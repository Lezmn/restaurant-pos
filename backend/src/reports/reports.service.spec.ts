import { ExpenseCategory, PaymentMethod, Prisma, SlipStatus, TableStatus } from '@prisma/client';
import { ReportsService } from './reports.service';

const D = (v: number) => new Prisma.Decimal(v);

function makePrisma() {
  return {
    payment: { findMany: jest.fn().mockResolvedValue([]), groupBy: jest.fn().mockResolvedValue([]) },
    order: { count: jest.fn().mockResolvedValue(0) },
    expense: {
      aggregate: jest.fn().mockResolvedValue({ _sum: { amount: null } }),
      findMany: jest.fn().mockResolvedValue([]),
    },
    restaurantTable: { groupBy: jest.fn().mockResolvedValue([]) },
  } as any;
}

describe('ReportsService', () => {
  let prisma: ReturnType<typeof makePrisma>;
  let service: ReportsService;

  beforeEach(() => {
    prisma = makePrisma();
    service = new ReportsService(prisma);
  });

  describe('getDashboard', () => {
    it('ยอดขาย/กำไร/แยกวิธีจ่าย ของวันนี้', async () => {
      const now = new Date();
      prisma.payment.findMany
        .mockResolvedValueOnce([
          { amount: D(100.25), method: PaymentMethod.CASH },
          { amount: D(200), method: PaymentMethod.PROMPTPAY },
          { amount: D(49.75), method: PaymentMethod.CASH },
        ])
        .mockResolvedValueOnce([{ amount: D(350), paidAt: now }]);
      prisma.expense.aggregate.mockResolvedValue({ _sum: { amount: D(80) } });
      prisma.order.count.mockResolvedValue(7);
      prisma.restaurantTable.groupBy.mockResolvedValue([
        { status: TableStatus.OCCUPIED, _count: { _all: 3 } },
        { status: TableStatus.AVAILABLE, _count: { _all: 5 } },
      ]);
      prisma.payment.groupBy.mockResolvedValue([
        { slipStatus: SlipStatus.PENDING, _count: { _all: 2 } },
      ]);

      const r: any = await service.getDashboard();
      expect(Number(r.revenue)).toBe(350);
      expect(Number(r.expenses)).toBe(80);
      expect(Number(r.netProfit)).toBe(270);
      expect(r.paymentCount).toBe(3);
      expect(r.orderCount).toBe(7);
      expect(Number(r.revenueByMethod.CASH)).toBe(150);
      expect(Number(r.revenueByMethod.PROMPTPAY)).toBe(200);
      expect(r.tables).toEqual({ AVAILABLE: 5, OCCUPIED: 3, total: 8 });
      expect(r.slipIssues).toEqual({ pending: 2, failed: 0 });
    });

    it('เทรนด์ 7 วันครบทุกวัน เติม 0 วันที่ไม่มียอด และวันสุดท้ายคือวันนี้ (เวลาไทย)', async () => {
      const lateTonight = new Date();
      lateTonight.setHours(23, 50, 0, 0);
      prisma.payment.findMany
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([{ amount: D(99), paidAt: lateTonight }]);
      const r: any = await service.getDashboard();
      expect(r.revenueTrend).toHaveLength(7);
      const t = new Date();
      const todayKey = `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`;
      expect(r.revenueTrend[6]).toEqual({ date: todayKey, revenue: D(99) });
      expect(r.revenueTrend.slice(0, 6).every((p: any) => Number(p.revenue) === 0)).toBe(true);
    });

    it('นับเฉพาะบิล COMPLETED (บิลที่ยกเลิกไม่เป็นยอดขาย)', async () => {
      await service.getDashboard();
      expect(prisma.payment.findMany.mock.calls[0][0].where.status).toBe('COMPLETED');
      expect(prisma.payment.findMany.mock.calls[1][0].where.status).toBe('COMPLETED');
    });
  });

  describe('getIncomeExpense', () => {
    it('รวมรายรับ-รายจ่าย กำไรสุทธิ และเรียงธุรกรรมใหม่สุดก่อน', async () => {
      prisma.payment.findMany.mockResolvedValue([
        { id: 'p1', amount: D(300), method: PaymentMethod.CASH, paidAt: new Date(2026, 8, 3), receipt: { number: 'R1' } },
        { id: 'p2', amount: D(150.5), method: PaymentMethod.PROMPTPAY, paidAt: new Date(2026, 8, 1), receipt: null },
      ]);
      prisma.expense.findMany.mockResolvedValue([
        { id: 'e1', title: 'ผัก', amount: D(100), category: ExpenseCategory.INGREDIENTS, spentAt: new Date(2026, 8, 2), paidFromDrawer: true, createdByName: 'A' },
      ]);
      const r: any = await service.getIncomeExpense({ month: '2026-09' });
      expect(Number(r.totalIncome)).toBe(450.5);
      expect(Number(r.totalExpense)).toBe(100);
      expect(Number(r.netProfit)).toBe(350.5);
      expect(r.transactions.map((t: any) => t.id)).toEqual(['p1', 'e1', 'p2']);
      expect(r.transactions[0].title).toBe('ใบเสร็จ R1');
      expect(Number(r.expenseByCategory.INGREDIENTS)).toBe(100);
      expect(Number(r.incomeByMethod.PROMPTPAY)).toBe(150.5);
    });

    it('ไม่ระบุช่วง = เดือนปัจจุบันตามเวลาไทย', async () => {
      await service.getIncomeExpense({});
      const where = prisma.payment.findMany.mock.calls[0][0].where;
      const now = new Date();
      expect(where.paidAt.gte).toEqual(new Date(now.getFullYear(), now.getMonth(), 1));
      expect(where.paidAt.lt).toEqual(new Date(now.getFullYear(), now.getMonth() + 1, 1));
    });
  });
});
