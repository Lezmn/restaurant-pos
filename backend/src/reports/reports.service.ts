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
          where: { createdAt: { gte: todayStart, lt: tomorrowStart } },
        }),
        this.prisma.expense.aggregate({
          _sum: { amount: true },
          where: { spentAt: { gte: todayStart, lt: tomorrowStart } },
        }),
        this.prisma.restaurantTable.groupBy({
          by: ['status'],
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
