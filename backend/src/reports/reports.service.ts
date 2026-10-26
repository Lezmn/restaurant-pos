import { Injectable } from '@nestjs/common';
import {
  ExpenseCategory,
  PaymentMethod,
  PaymentStatus,
  Prisma,
  SlipStatus,
  TableStatus,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  addDays,
  monthToRange,
  resolveDateRange,
  startOfDay,
} from '../common/date-range.util';
import { ReportRangeQueryDto } from './dto/report-range-query.dto';

const TREND_DAYS = 7;

/** ออเดอร์ที่ใช้เวลาตั้งแต่สั่งถึงเสร็จเกินนี้ (นาที) = "ช้า" — ตรงกับเกณฑ์ขึ้นแดงบนจอครัว */
export const KITCHEN_LATE_MINUTES = 15;
/** เมนูต้องถูกสั่งอย่างน้อยเท่านี้ออเดอร์ถึงจะขึ้นอันดับ "ทำนานสุด" — กันเมนูที่สั่งครั้งเดียวแล้วบังเอิญช้า */
const SLOW_MENU_MIN_ORDERS = 3;
const SLOW_MENU_TOP = 5;

const minutesBetween = (from: Date, to: Date) => (to.getTime() - from.getTime()) / 60_000;
const average = (values: number[]) =>
  values.length === 0 ? null : Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 10) / 10;

@Injectable()
export class ReportsService {
  constructor(private readonly prisma: PrismaService) {}

  /** สรุปของวันนี้ + เทรนด์ 7 วัน สำหรับหน้า Dashboard */
  async getDashboard() {
    const todayStart = startOfDay();
    const tomorrowStart = addDays(todayStart, 1);
    const trendStart = addDays(todayStart, -(TREND_DAYS - 1));

    const [
      todayPayments,
      todayOrderCount,
      todayExpenses,
      tableGroups,
      trendPayments,
      slipGroups,
      todaySessions,
    ] = await Promise.all([
        // นับเฉพาะบิลที่ยังไม่ถูกยกเลิก ไม่งั้นยอดขายจะเกินจริง
        this.prisma.payment.findMany({
          where: {
            status: PaymentStatus.COMPLETED,
            paidAt: { gte: todayStart, lt: tomorrowStart },
          },
          select: { amount: true, method: true },
        }),
        this.prisma.order.count({
          // splitFromId = ออเดอร์ที่แตกออกมาตอนแยกบิลตามรายการ ไม่ใช่การสั่งใหม่
          where: { createdAt: { gte: todayStart, lt: tomorrowStart }, splitFromId: null },
        }),
        this.prisma.expense.aggregate({
          _sum: { amount: true },
          where: { spentAt: { gte: todayStart, lt: tomorrowStart } },
        }),
        this.prisma.restaurantTable.groupBy({
          by: ['status'],
          // โต๊ะเสมือนของกลับบ้านไม่ใช่โต๊ะจริง ไม่นับในจำนวนโต๊ะว่าง/มีลูกค้า
          where: { isTakeaway: false },
          _count: { _all: true },
        }),
        this.prisma.payment.findMany({
          where: {
            status: PaymentStatus.COMPLETED,
            paidAt: { gte: trendStart, lt: tomorrowStart },
          },
          select: { amount: true, paidAt: true },
        }),
        this.prisma.payment.groupBy({
          by: ['slipStatus'],
          where: {
            status: PaymentStatus.COMPLETED,
            slipStatus: { in: [SlipStatus.PENDING, SlipStatus.FAILED] },
          },
          _count: { _all: true },
        }),
        // โต๊ะที่เปิดวันนี้ — รวมจำนวนลูกค้าที่พนักงานกดระบุไว้ (QR ที่หมดอายุโดยไม่มีออเดอร์ก็ยังนับ เพราะลูกค้ามานั่งจริง)
        this.prisma.tableSession.aggregate({
          // บิลกลับบ้านไม่มีจำนวนลูกค้านั่งโต๊ะ — ไม่นับ ไม่งั้น "โต๊ะที่ไม่ได้ระบุจำนวน" จะพองตาม
          where: { openedAt: { gte: todayStart, lt: tomorrowStart }, isTakeaway: false },
          _sum: { guestCount: true },
          _count: { _all: true, guestCount: true },
        }),
      ]);

    const revenue = this.sum(todayPayments.map((payment) => payment.amount));
    const expenses = todayExpenses._sum.amount ?? new Prisma.Decimal(0);

    return {
      date: todayStart,
      revenue,
      expenses,
      netProfit: revenue.minus(expenses),
      orderCount: todayOrderCount,
      paymentCount: todayPayments.length,
      revenueByMethod: this.sumByMethod(todayPayments),
      tables: this.countTablesByStatus(tableGroups),
      revenueTrend: this.buildTrend(trendPayments, trendStart),
      // บิล PromptPay ที่ยังยืนยันไม่ได้ว่าเงินเข้าจริง — ไม่จำกัดวัน ค้างอยู่จนกว่าจะจัดการ
      // ลูกค้าเข้าใช้บริการ — tablesWithoutCount = โต๊ะที่ไม่ได้ระบุจำนวน (ยอดจริงอาจมากกว่านี้)
      guests: {
        total: todaySessions._sum.guestCount ?? 0,
        tables: todaySessions._count._all,
        tablesWithoutCount: todaySessions._count._all - todaySessions._count.guestCount,
      },
      slipIssues: {
        pending: slipGroups.find((g) => g.slipStatus === SlipStatus.PENDING)?._count._all ?? 0,
        failed: slipGroups.find((g) => g.slipStatus === SlipStatus.FAILED)?._count._all ?? 0,
      },
    };
  }

  /** รายรับ-รายจ่ายของช่วงเวลาหนึ่ง พร้อมรายการธุรกรรม */
  async getIncomeExpense(query: ReportRangeQueryDto) {
    const range = this.resolveRangeOrCurrentMonth(query);

    const [payments, expenses] = await Promise.all([
      this.prisma.payment.findMany({
        where: { status: PaymentStatus.COMPLETED, paidAt: range },
        select: {
          id: true,
          amount: true,
          method: true,
          paidAt: true,
          receipt: { select: { number: true } },
        },
        orderBy: { paidAt: 'desc' },
      }),
      this.prisma.expense.findMany({
        where: { spentAt: range },
        orderBy: { spentAt: 'desc' },
      }),
    ]);

    const totalIncome = this.sum(payments.map((payment) => payment.amount));
    const totalExpense = this.sum(expenses.map((expense) => expense.amount));

    const transactions = [
      ...payments.map((payment) => ({
        type: 'INCOME' as const,
        id: payment.id,
        date: payment.paidAt,
        title: payment.receipt?.number
          ? `ใบเสร็จ ${payment.receipt.number}`
          : 'รับชำระเงิน',
        category: payment.method as PaymentMethod,
        amount: payment.amount,
        paidFromDrawer: false,
        createdByName: null,
      })),
      ...expenses.map((expense) => ({
        type: 'EXPENSE' as const,
        id: expense.id,
        date: expense.spentAt,
        title: expense.title,
        category: expense.category,
        amount: expense.amount,
        // ให้หน้ารายรับ-รายจ่ายติดป้าย "จากลิ้นชัก · โดย ..." ได้
        paidFromDrawer: expense.paidFromDrawer,
        createdByName: expense.createdByName,
      })),
    ].sort((a, b) => b.date.getTime() - a.date.getTime());

    return {
      range: { from: range.gte ?? null, to: range.lt ?? range.lte ?? null },
      totalIncome,
      totalExpense,
      netProfit: totalIncome.minus(totalExpense),
      incomeByMethod: this.sumByMethod(payments),
      expenseByCategory: this.sumByCategory(expenses),
      transactions,
    };
  }

  /**
   * เมนูขายดี + ช่วงเวลาขายดี ของช่วงเวลาหนึ่ง (ไม่ระบุ = เดือนปัจจุบัน)
   * นับเฉพาะออเดอร์ที่จ่ายเงินแล้วและบิลไม่ถูก void — ออเดอร์ยกเลิก/ค้างจ่ายไม่ใช่ "ขายได้"
   * ช่วงเวลาใช้เวลาที่ลูกค้าสั่ง (ไม่ใช่เวลาจ่าย) เพราะอยากรู้ว่าครัวยุ่งตอนไหน
   * ยอดเป็นราคาเมนู + ตัวเลือก ก่อนส่วนลดท้ายบิล (ส่วนลดเป็นของทั้งบิล แบ่งรายเมนูไม่ได้)
   */
  async getSales(query: ReportRangeQueryDto) {
    const range = this.resolveRangeOrCurrentMonth(query);

    const [orders, menuItems] = await Promise.all([
      this.prisma.order.findMany({
        where: {
          createdAt: range,
          payment: { status: PaymentStatus.COMPLETED },
        },
        select: {
          createdAt: true,
          startedAt: true,
          servedAt: true,
          items: {
            select: {
              quantity: true,
              unitPrice: true,
              menuItemId: true,
              selectedOptions: { select: { price: true } },
            },
          },
        },
      }),
      this.prisma.menuItem.findMany({
        select: {
          id: true,
          name: true,
          isAvailable: true,
          category: { select: { name: true } },
        },
        orderBy: { name: 'asc' },
      }),
    ]);

    const byMenu = new Map<string, { quantity: number; revenue: Prisma.Decimal }>();
    const byHour = Array.from({ length: 24 }, (_, hour) => ({
      hour,
      orderCount: 0,
      quantity: 0,
      revenue: new Prisma.Decimal(0),
    }));

    // วัน (0 = อาทิตย์ ตาม getDay) × ชั่วโมง — ไว้วาง heatmap ว่าวันไหนชั่วโมงไหนยุ่ง
    const byWeekdayHour = Array.from({ length: 7 }, () => Array<number>(24).fill(0));

    for (const order of orders) {
      const slot = byHour[order.createdAt.getHours()];
      slot.orderCount += 1;
      byWeekdayHour[order.createdAt.getDay()][order.createdAt.getHours()] += 1;
      for (const item of order.items) {
        const each = item.selectedOptions.reduce(
          (total, option) => total.plus(option.price),
          new Prisma.Decimal(item.unitPrice),
        );
        const lineTotal = each.times(item.quantity);
        slot.quantity += item.quantity;
        slot.revenue = slot.revenue.plus(lineTotal);
        // รายการราคาเปิดไม่ใช่เมนู — นับในยอดรายชั่วโมง แต่ไม่ขึ้นอันดับเมนูขายดี
        if (!item.menuItemId) continue;
        const menu = byMenu.get(item.menuItemId) ?? {
          quantity: 0,
          revenue: new Prisma.Decimal(0),
        };
        menu.quantity += item.quantity;
        menu.revenue = menu.revenue.plus(lineTotal);
        byMenu.set(item.menuItemId, menu);
      }
    }

    const items = menuItems
      .map((menu) => ({
        menuItemId: menu.id,
        name: menu.name,
        categoryName: menu.category.name,
        isAvailable: menu.isAvailable,
        quantity: byMenu.get(menu.id)?.quantity ?? 0,
        revenue: byMenu.get(menu.id)?.revenue ?? new Prisma.Decimal(0),
      }))
      // ขายได้มากก่อน เท่ากันดูยอดเงิน แล้วค่อยเรียงชื่อให้ลำดับนิ่ง
      .sort(
        (a, b) =>
          b.quantity - a.quantity ||
          b.revenue.comparedTo(a.revenue) ||
          a.name.localeCompare(b.name, 'th'),
      );

    return {
      range: { from: range.gte ?? null, to: range.lt ?? range.lte ?? null },
      orderCount: orders.length,
      totalQuantity: items.reduce((n, item) => n + item.quantity, 0),
      totalRevenue: this.sum(items.map((item) => item.revenue)),
      topItems: items.filter((item) => item.quantity > 0),
      // เมนูที่ยังเปิดขายแต่ไม่มีใครสั่งเลยในช่วงนี้ — ไว้ให้เจ้าของร้านพิจารณาปรับเมนู
      unsoldItems: items
        .filter((item) => item.quantity === 0 && item.isAvailable)
        .map(({ menuItemId, name, categoryName }) => ({ menuItemId, name, categoryName })),
      byHour,
      byWeekdayHour,
      kitchen: this.kitchenStats(orders, menuItems),
    };
  }

  /**
   * ความเร็วครัว: รอคิว (สั่ง → เริ่มปรุง) และปรุง (เริ่มปรุง → เสร็จ)
   * ใช้เฉพาะออเดอร์ที่มีเวลาครบ — ออเดอร์ก่อนมีคอลัมน์ startedAt/servedAt ไม่ถูกนับ
   * เวลาปรุงเป็นของทั้งออเดอร์ (ครัวกดเสร็จทีละใบ ไม่ใช่ทีละจาน) — "เมนูที่ทำนาน" จึงเป็นค่าเฉลี่ยของออเดอร์ที่มีเมนูนั้น
   */
  private kitchenStats(
    orders: {
      createdAt: Date;
      startedAt: Date | null;
      servedAt: Date | null;
      items: { menuItemId: string | null }[];
    }[],
    menuItems: { id: string; name: string }[],
  ) {
    const waits: number[] = [];
    const cooks: number[] = [];
    const totals: number[] = [];
    const cookByMenu = new Map<string, number[]>();

    for (const order of orders) {
      if (!order.startedAt || !order.servedAt) continue;
      const wait = minutesBetween(order.createdAt, order.startedAt);
      const cook = minutesBetween(order.startedAt, order.servedAt);
      // เวลาติดลบ = นาฬิกาเพี้ยน/ข้อมูลแปลก ไม่เอามาเฉลี่ย
      if (wait < 0 || cook < 0) continue;
      waits.push(wait);
      cooks.push(cook);
      totals.push(wait + cook);
      const menuIds = new Set(order.items.map((i) => i.menuItemId).filter((id): id is string => !!id));
      for (const id of menuIds) {
        const list = cookByMenu.get(id) ?? [];
        list.push(cook);
        cookByMenu.set(id, list);
      }
    }

    const names = new Map(menuItems.map((m) => [m.id, m.name]));
    const slowestMenus = [...cookByMenu.entries()]
      .filter(([id, list]) => list.length >= SLOW_MENU_MIN_ORDERS && names.has(id))
      .map(([id, list]) => ({
        menuItemId: id,
        name: names.get(id)!,
        orderCount: list.length,
        avgCookMinutes: average(list)!,
      }))
      .sort((a, b) => b.avgCookMinutes - a.avgCookMinutes)
      .slice(0, SLOW_MENU_TOP);

    return {
      timedOrderCount: totals.length,
      avgWaitMinutes: average(waits),
      avgCookMinutes: average(cooks),
      avgTotalMinutes: average(totals),
      lateMinutes: KITCHEN_LATE_MINUTES,
      lateOrderCount: totals.filter((t) => t >= KITCHEN_LATE_MINUTES).length,
      slowestMenus,
    };
  }

  /** ไม่ระบุช่วงเวลา = เดือนปัจจุบัน */
  private resolveRangeOrCurrentMonth(query: ReportRangeQueryDto) {
    const range = resolveDateRange(query);
    if (range) return range;

    const now = new Date();
    const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const { start, end } = monthToRange(currentMonth);
    return { gte: start, lt: end };
  }

  private sum(amounts: Prisma.Decimal[]) {
    return amounts.reduce(
      (total, amount) => total.plus(amount),
      new Prisma.Decimal(0),
    );
  }

  private sumByMethod(payments: { amount: Prisma.Decimal; method: PaymentMethod }[]) {
    const totals = Object.fromEntries(
      Object.values(PaymentMethod).map((method) => [method, new Prisma.Decimal(0)]),
    ) as Record<PaymentMethod, Prisma.Decimal>;

    for (const payment of payments) {
      totals[payment.method] = totals[payment.method].plus(payment.amount);
    }
    return totals;
  }

  private sumByCategory(
    expenses: { amount: Prisma.Decimal; category: ExpenseCategory }[],
  ) {
    const totals = Object.fromEntries(
      Object.values(ExpenseCategory).map((category) => [
        category,
        new Prisma.Decimal(0),
      ]),
    ) as Record<ExpenseCategory, Prisma.Decimal>;

    for (const expense of expenses) {
      totals[expense.category] = totals[expense.category].plus(expense.amount);
    }
    return totals;
  }

  private countTablesByStatus(
    groups: { status: TableStatus; _count: { _all: number } }[],
  ) {
    const counts = Object.fromEntries(
      Object.values(TableStatus).map((status) => [status, 0]),
    ) as Record<TableStatus, number>;

    for (const group of groups) {
      counts[group.status] = group._count._all;
    }
    return { ...counts, total: groups.reduce((n, g) => n + g._count._all, 0) };
  }

  /** เติมวันที่ไม่มียอดขายด้วย 0 เพื่อให้กราฟมีครบทุกวัน */
  private buildTrend(
    payments: { amount: Prisma.Decimal; paidAt: Date }[],
    trendStart: Date,
  ) {
    const byDay = new Map<string, Prisma.Decimal>();
    for (const payment of payments) {
      const key = this.toDateKey(payment.paidAt);
      byDay.set(key, (byDay.get(key) ?? new Prisma.Decimal(0)).plus(payment.amount));
    }

    return Array.from({ length: TREND_DAYS }, (_, index) => {
      const date = addDays(trendStart, index);
      const key = this.toDateKey(date);
      return { date: key, revenue: byDay.get(key) ?? new Prisma.Decimal(0) };
    });
  }

  private toDateKey(date: Date) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  }
}
