import { ExpenseCategory, PaymentMethod, Prisma, SlipStatus, TableStatus } from '@prisma/client';
import { ReportsService } from '../../../src/reports/reports.service';

const D = (v: number) => new Prisma.Decimal(v);

function makePrisma() {
  return {
    payment: { findMany: jest.fn().mockResolvedValue([]), groupBy: jest.fn().mockResolvedValue([]) },
    order: { count: jest.fn().mockResolvedValue(0), findMany: jest.fn().mockResolvedValue([]) },
    menuItem: { findMany: jest.fn().mockResolvedValue([]) },
    expense: {
      aggregate: jest.fn().mockResolvedValue({ _sum: { amount: null } }),
      findMany: jest.fn().mockResolvedValue([]),
    },
    restaurantTable: { groupBy: jest.fn().mockResolvedValue([]) },
    tableSession: {
      aggregate: jest.fn().mockResolvedValue({
        _sum: { guestCount: 7 },
        _count: { _all: 3, guestCount: 2 },
      }),
    },
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
    it('ลูกค้าเข้าใช้บริการ = รวมจำนวนที่ระบุ + บอกจำนวนโต๊ะที่ไม่ได้ระบุ', async () => {
      const r = await service.getDashboard();
      expect(r.guests).toEqual({ total: 7, tables: 3, tablesWithoutCount: 1 });
    });

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
  describe('getSales', () => {
    const menus = [
      { id: 'm1', name: 'กะเพรา', isAvailable: true, category: { name: 'จานเดียว' } },
      { id: 'm2', name: 'ชาเย็น', isAvailable: true, category: { name: 'เครื่องดื่ม' } },
      { id: 'm3', name: 'ต้มยำ', isAvailable: true, category: { name: 'กับข้าว' } },
      { id: 'm4', name: 'ปิดขายอยู่', isAvailable: false, category: { name: 'กับข้าว' } },
    ];
    const line = (menuItemId: string, quantity: number, unitPrice: number, options: number[] = []) => ({
      menuItemId,
      quantity,
      unitPrice: D(unitPrice),
      selectedOptions: options.map((price) => ({ price: D(price) })),
    });

    beforeEach(() => {
      prisma.menuItem.findMany.mockResolvedValue(menus);
      prisma.order.findMany.mockResolvedValue([
        { createdAt: new Date(2026, 8, 3, 12, 15), items: [line('m1', 2, 60, [10]), line('m2', 1, 25)] },
        { createdAt: new Date(2026, 8, 3, 12, 50), items: [line('m2', 3, 25)] },
        { createdAt: new Date(2026, 8, 4, 18, 5), items: [line('m1', 1, 60)] },
      ]);
    });

    it('นับเฉพาะออเดอร์ที่จ่ายแล้วและบิลไม่ถูก void ในช่วงที่เลือก', async () => {
      await service.getSales({ month: '2026-09' });
      const where = prisma.order.findMany.mock.calls[0][0].where;
      expect(where.payment).toEqual({ status: 'COMPLETED' });
      expect(where.createdAt).toEqual({ gte: new Date(2026, 8, 1), lt: new Date(2026, 9, 1) });
    });

    it('เรียงเมนูตามจำนวนที่ขาย คิดยอดรวมราคาตัวเลือก', async () => {
      const r: any = await service.getSales({ month: '2026-09' });
      expect(r.topItems.map((i: any) => [i.name, i.quantity, Number(i.revenue)])).toEqual([
        ['ชาเย็น', 4, 100],
        ['กะเพรา', 3, 200], // 2 × (60 + 10) + 60
      ]);
      expect(r.totalQuantity).toBe(7);
      expect(Number(r.totalRevenue)).toBe(300);
      expect(r.orderCount).toBe(3);
    });

    it('แยกตามชั่วโมงที่สั่ง ครบ 24 ช่อง', async () => {
      const r: any = await service.getSales({ month: '2026-09' });
      expect(r.byHour).toHaveLength(24);
      expect(r.byHour[12]).toMatchObject({ hour: 12, orderCount: 2, quantity: 6 });
      expect(Number(r.byHour[12].revenue)).toBe(240);
      expect(r.byHour[18]).toMatchObject({ orderCount: 1, quantity: 1 });
      expect(r.byHour[9].orderCount).toBe(0);
    });

    it('เมนูไม่มีคนสั่ง = เฉพาะที่ยังเปิดขาย', async () => {
      const r: any = await service.getSales({ month: '2026-09' });
      expect(r.unsoldItems).toEqual([{ menuItemId: 'm3', name: 'ต้มยำ', categoryName: 'กับข้าว' }]);
    });

    it('heatmap วัน × ชั่วโมง (3 ก.ย. 2026 = วันพฤหัส)', async () => {
      const r: any = await service.getSales({ month: '2026-09' });
      expect(r.byWeekdayHour).toHaveLength(7);
      expect(r.byWeekdayHour[4][12]).toBe(2);
      expect(r.byWeekdayHour[5][18]).toBe(1);
      expect(r.byWeekdayHour.flat().reduce((a: number, b: number) => a + b, 0)).toBe(3);
    });

    it('ความเร็วครัว: เฉลี่ยรอคิว/ปรุง นับเฉพาะออเดอร์ที่มีเวลาครบ', async () => {
      const at = (h: number, m: number) => new Date(2026, 8, 3, h, m);
      const timed = (start: number, cook: number, menu: string) => ({
        createdAt: at(12, 0),
        startedAt: at(12, start),
        servedAt: at(12, start + cook),
        items: [line(menu, 1, 60)],
      });
      prisma.order.findMany.mockResolvedValue([
        timed(2, 8, 'm1'), // รวม 10
        timed(4, 12, 'm1'), // รวม 16 → ช้า
        timed(0, 10, 'm1'),
        timed(3, 3, 'm2'),
        { createdAt: at(13, 0), startedAt: null, servedAt: null, items: [line('m2', 1, 25)] },
      ]);
      const { kitchen }: any = await service.getSales({ month: '2026-09' });
      expect(kitchen.timedOrderCount).toBe(4);
      expect(kitchen.avgWaitMinutes).toBe(2.3); // (2+4+0+3)/4 = 2.25
      expect(kitchen.avgCookMinutes).toBe(8.3); // (8+12+10+3)/4 = 8.25
      expect(kitchen.lateOrderCount).toBe(1);
      // ชาเย็นสั่งแค่ 1 ออเดอร์ ไม่ถึงเกณฑ์ขึ้นอันดับ
      expect(kitchen.slowestMenus).toEqual([
        { menuItemId: 'm1', name: 'กะเพรา', orderCount: 3, avgCookMinutes: 10 },
      ]);
    });
  });
});
