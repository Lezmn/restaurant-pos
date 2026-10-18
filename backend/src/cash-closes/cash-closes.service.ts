import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  OrderStatus,
  PaymentMethod,
  PaymentStatus,
  Prisma,
  TableSessionStatus,
} from '@prisma/client';
import { AuthenticatedUser } from '../auth/jwt.strategy';
import { addDays, monthToRange, startOfDay } from '../common/date-range.util';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCashCloseDto } from './dto/create-cash-close.dto';
import { FindCashClosesQueryDto } from './dto/find-cash-closes-query.dto';

@Injectable()
export class CashClosesService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * ยอดของวันก่อนนับเงิน — หน้าปิดยอดใช้แสดงยอดเงินสด/PromptPay
   * และเตือนถ้ายังมีโต๊ะค้างจ่าย (ปิดยอดไปแล้ว เงินที่เก็บทีหลังจะไม่อยู่ในยอดวันนี้)
   */
  async preview(date?: string) {
    const dateKey = this.resolveDateKey(date);
    const dayStart = this.dateKeyToStart(dateKey);
    const [totals, unpaidTableCount, existing, lastClose, drawerExpenseItems] = await Promise.all([
      this.computeTotals(dateKey),
      this.countTablesWithUnpaidOrders(),
      this.prisma.dailyCashClose.findUnique({ where: { date: dateKey } }),
      this.prisma.dailyCashClose.findFirst({
        where: { date: { lt: dateKey } },
        orderBy: { date: 'desc' },
        select: { openingFloat: true },
      }),
      // ให้แคชเชียร์เห็นว่าบันทึกเงินที่หยิบออกอะไรไปแล้ว กันบันทึกซ้ำ/ลืม
      this.prisma.expense.findMany({
        where: {
          paidFromDrawer: true,
          spentAt: { gte: dayStart, lt: addDays(dayStart, 1) },
        },
        select: { id: true, title: true, amount: true, spentAt: true, createdByName: true },
        orderBy: { spentAt: 'asc' },
      }),
    ]);

    return {
      date: dateKey,
      ...totals,
      drawerExpenseItems,
      unpaidTableCount,
      // ให้หน้าจอเติมเงินทอนตั้งต้นให้ก่อน ส่วนใหญ่ร้านใช้ยอดเดิมทุกวัน
      suggestedOpeningFloat: lastClose?.openingFloat ?? null,
      alreadyClosed: existing,
    };
  }

  async create(dto: CreateCashCloseDto, user: AuthenticatedUser) {
    const dateKey = this.resolveDateKey(dto.date);
    const totals = await this.computeTotals(dateKey);

    const openingFloat = new Prisma.Decimal(dto.openingFloat);
    const countedCash = new Prisma.Decimal(dto.countedCash);
    const expectedCash = openingFloat
      .plus(totals.cashSales)
      .minus(totals.drawerExpenses);

    try {
      return await this.prisma.dailyCashClose.create({
        data: {
          date: dateKey,
          openingFloat,
          cashSales: totals.cashSales,
          drawerExpenses: totals.drawerExpenses,
          expectedCash,
          countedCash,
          difference: countedCash.minus(expectedCash),
          promptpaySales: totals.promptpaySales,
          note: dto.note,
          closedById: user.id,
          closedByName: user.name,
        },
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException(
          `วันที่ ${dateKey} ปิดยอดไปแล้ว — ถ้าต้องการนับใหม่ให้ผู้ดูแลลบรายการเดิมก่อน`,
        );
      }
      throw error;
    }
  }

  findAll(query: FindCashClosesQueryDto) {
    let where: Prisma.DailyCashCloseWhereInput | undefined;
    if (query.month) {
      const { start, end } = monthToRange(query.month);
      where = { date: { gte: this.toDateKey(start), lt: this.toDateKey(end) } };
    }
    return this.prisma.dailyCashClose.findMany({
      where,
      orderBy: { date: 'desc' },
    });
  }

  /**
   * คืน snapshot ตอนปิด + ยอดที่คำนวณใหม่ตอนนี้
   * ถ้าไม่ตรงกัน แปลว่ามีการยกเลิกบิล/แก้รายจ่ายของวันนั้นหลังปิดยอด
   */
  async findOne(id: string) {
    const cashClose = await this.prisma.dailyCashClose.findUnique({ where: { id } });
    if (!cashClose) {
      throw new NotFoundException(`ไม่พบรายการปิดยอด id: ${id}`);
    }

    const current = await this.computeTotals(cashClose.date);
    const changedSinceClose =
      !current.cashSales.equals(cashClose.cashSales) ||
      !current.drawerExpenses.equals(cashClose.drawerExpenses) ||
      !current.promptpaySales.equals(cashClose.promptpaySales);

    return { ...cashClose, current, changedSinceClose };
  }

  async remove(id: string) {
    await this.findOne(id);
    // คืนแถวที่ลบเหมือน expenses — คืน void แล้วได้ 200 body ว่าง apiClient ฝั่งเว็บ parse JSON พัง
    return this.prisma.dailyCashClose.delete({ where: { id } });
  }

  private async computeTotals(dateKey: string) {
    const dayStart = this.dateKeyToStart(dateKey);
    const range = { gte: dayStart, lt: addDays(dayStart, 1) };

    const [paymentGroups, drawerExpenses] = await Promise.all([
      // นับเฉพาะบิลที่ยังไม่ถูกยกเลิก
      this.prisma.payment.groupBy({
        by: ['method'],
        where: { status: PaymentStatus.COMPLETED, paidAt: range },
        _sum: { amount: true },
        _count: { _all: true },
      }),
      this.prisma.expense.aggregate({
        where: { paidFromDrawer: true, spentAt: range },
        _sum: { amount: true },
      }),
    ]);

    const zero = new Prisma.Decimal(0);
    const byMethod = (method: PaymentMethod) =>
      paymentGroups.find((group) => group.method === method)?._sum.amount ?? zero;

    return {
      cashSales: byMethod(PaymentMethod.CASH),
      promptpaySales: byMethod(PaymentMethod.PROMPTPAY),
      drawerExpenses: drawerExpenses._sum.amount ?? zero,
      paymentCount: paymentGroups.reduce((n, group) => n + group._count._all, 0),
    };
  }

  /**
   * นับโต๊ะที่ยังมีออเดอร์ค้างจ่าย (ไม่สนว่าเปิดตั้งแต่วันไหน)
   * เฉพาะ session ที่ยังเปิด — ออเดอร์ค้างใน session ที่หมดอายุไปแล้วเก็บเงินจากหน้า Check ไม่ได้
   */
  private async countTablesWithUnpaidOrders() {
    const groups = await this.prisma.order.groupBy({
      by: ['tableId'],
      where: {
        paymentId: null,
        status: { not: OrderStatus.CANCELLED },
        tableSession: { status: TableSessionStatus.OPEN },
      },
    });
    return groups.length;
  }

  /** ไม่ส่งวันที่ = วันนี้, ห้ามปิดยอดล่วงหน้า */
  private resolveDateKey(date?: string) {
    const today = this.toDateKey(startOfDay());
    if (!date) return today;

    const start = this.dateKeyToStart(date);
    if (this.toDateKey(start) !== date) {
      throw new BadRequestException(`วันที่ ${date} ไม่มีจริง`);
    }
    if (date > today) {
      throw new BadRequestException('ปิดยอดล่วงหน้าไม่ได้');
    }
    return date;
  }

  /** 'YYYY-MM-DD' → 00:00 ของวันนั้นตามเวลาเครื่อง (เหมือน startOfDay ใน date-range.util) */
  private dateKeyToStart(dateKey: string) {
    const [year, month, day] = dateKey.split('-').map(Number);
    return new Date(year, month - 1, day);
  }

  private toDateKey(date: Date) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  }
}
