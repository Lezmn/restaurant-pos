import { getPayments } from '@/features/payments/api'
import { apiClient } from '@/lib/api-client'
import type { ApiDashboardReport, ApiIncomeExpenseReport, ApiSalesReport } from '@/types/api'
import { PaymentMethod, PaymentStatus, TableStatus } from '@/types/enums'
import type { Payment } from '@/types/models'
import type {
  DashboardData,
  DashboardPeriodDays,
  FinanceData,
  Notification,
  PeriodData,
  RevenuePoint,
  SalesData,
} from '@/types/reports'

const DAY_MS = 24 * 60 * 60 * 1000

/** "2026-09-17" → "พ." — parse แบบ local ไม่ให้ UTC เลื่อนวัน (narrow ได้ "พ" ไม่มีจุด) */
const weekdayLabel = (ymd: string) => {
  const day = new Date(`${ymd}T00:00:00`)
  return `${day.toLocaleDateString('th-TH', { weekday: 'narrow' })}.`
}

/** เดือนปัจจุบันตามเครื่องผู้ใช้ ในรูป YYYY-MM ที่ backend รับ */
export const currentMonth = () => {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

/**
 * /reports/dashboard ให้ยอดรวมต่อวิธีจ่ายมาแล้ว แต่ไม่ได้ให้ "จำนวนบิล" ต่อวิธีจ่าย
 * และไม่มีรายการบิลล่าสุด — จึงดึง /payments มาประกอบเอง
 * ตัดช่วง "วันนี้" ด้วย report.date ของ backend ไม่ใช่เวลาเครื่องผู้ใช้ ตัวเลขจะได้ตรงกัน
 */
export async function getDashboard(): Promise<DashboardData> {
  const report = await apiClient<ApiDashboardReport>('/reports/dashboard')
  const dayStart = new Date(report.date).getTime()
  // ดึงเฉพาะบิลของวันเดียวกับรายงาน ไม่ใช่ทั้งประวัติร้าน
  const payments = await getPayments({
    from: new Date(dayStart),
    to: new Date(dayStart + DAY_MS),
  })

  const todayPayments = payments.filter((p) => {
    const paidAt = new Date(p.paidAt).getTime()
    return (
      p.status === PaymentStatus.COMPLETED &&
      paidAt >= dayStart &&
      paidAt < dayStart + DAY_MS
    )
  })

  const countByMethod = (method: PaymentMethod) =>
    todayPayments.filter((p) => p.method === method).length

  const trend: RevenuePoint[] = report.revenueTrend.map((point) => ({
    label: weekdayLabel(point.date),
    date: point.date,
    revenue: point.revenue,
  }))

  // /payments เรียงล่าสุดก่อนอยู่แล้ว
  // ส่งครบทุกใบ แล้วให้หน้า Dashboard แบ่งหน้าเอง (เดิม slice(0,10) ทิ้ง ทำให้ดูบิลเก่าของวันไม่ได้เลย)
  const notifications: Notification[] = todayPayments
    .map((p: Payment) => ({
      id: p.id,
      tableName: p.tableName,
      method: p.method,
      amount: p.amount,
      createdAt: p.paidAt,
    }))

  return {
    summary: {
      date: report.date,
      revenue: report.revenue,
      expenseTotal: report.expenses,
      netProfit: report.netProfit,
      cashTotal: report.revenueByMethod.CASH,
      promptPayTotal: report.revenueByMethod.PROMPTPAY,
      orderCount: report.orderCount,
      paymentCount: report.paymentCount,
    },
    trend,
    todayStatus: {
      cashCount: countByMethod(PaymentMethod.CASH),
      promptPayCount: countByMethod(PaymentMethod.PROMPTPAY),
      tablesInUse: report.tables[TableStatus.OCCUPIED],
      tablesTotal: report.tables.total,
    },
    notifications,
    slipIssues: report.slipIssues ?? { pending: 0, failed: 0 },
  }
}

/** GET /reports/income-expense?month=YYYY-MM @Roles(ADMIN) */
export async function getFinance(month: string): Promise<FinanceData> {
  const report = await apiClient<ApiIncomeExpenseReport>(
    `/reports/income-expense?month=${encodeURIComponent(month)}`,
  )

  return {
    month,
    summary: {
      netProfit: report.netProfit,
      expenseTotal: report.totalExpense,
      revenueTotal: report.totalIncome,
      cashTotal: report.incomeByMethod.CASH,
      promptPayTotal: report.incomeByMethod.PROMPTPAY,
      paymentCount: report.transactions.filter((t) => t.type === 'INCOME').length,
    },
    transactions: report.transactions.map((t) => ({
      id: t.id,
      type: t.type,
      date: t.date,
      detail: t.title,
      category: t.category,
      // ตารางรวมรายรับ-รายจ่ายไว้ด้วยกัน จึงเก็บรายจ่ายเป็นค่าลบ
      amount: t.type === 'EXPENSE' ? -t.amount : t.amount,
      paidFromDrawer: t.paidFromDrawer,
      createdByName: t.createdByName,
    })),
  }
}

/** GET /reports/sales?month=YYYY-MM @Roles(ADMIN) — เมนูขายดี + ช่วงเวลาขายดี */
export async function getSales(month: string): Promise<SalesData> {
  const report = await apiClient<ApiSalesReport>(
    `/reports/sales?month=${encodeURIComponent(month)}`,
  )
  return {
    month,
    orderCount: report.orderCount,
    totalQuantity: report.totalQuantity,
    totalRevenue: report.totalRevenue,
    topItems: report.topItems.map(({ menuItemId, name, categoryName, quantity, revenue }) => ({
      menuItemId,
      name,
      categoryName,
      quantity,
      revenue,
    })),
    unsoldItems: report.unsoldItems,
    byHour: report.byHour,
    byWeekdayHour: report.byWeekdayHour,
    kitchen: report.kitchen,
  }
}

const pad2 = (n: number) => String(n).padStart(2, '0')
/** Date → "YYYY-MM-DD" ตามเวลาเครื่อง (backend อ่านวันล้วนเป็นวันตามเวลาร้าน และ to = ถึงสิ้นวัน) */
const toYmd = (d: Date) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
/** "2026-10-26" → "26/10" สำหรับแกนกราฟ 30 วัน */
const dayMonthLabel = (ymd: string) => `${Number(ymd.slice(8, 10))}/${Number(ymd.slice(5, 7))}`

/**
 * สรุป N วันล่าสุด (รวมวันนี้) จาก /reports/income-expense?from&to
 * endpoint นี้ส่งรายการรายรับแต่ละบิลมาด้วย จึงรวมเป็นรายวัน/แยกวิธีจ่ายฝั่งนี้ได้ ไม่ต้องเพิ่ม API
 */
export async function getDashboardPeriod(days: DashboardPeriodDays): Promise<PeriodData> {
  const today = new Date()
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate() - (days - 1))
  const from = toYmd(start)
  const to = toYmd(today)
  const report = await apiClient<ApiIncomeExpenseReport>(
    `/reports/income-expense?from=${from}&to=${to}`,
  )

  const incomes = report.transactions.filter((t) => t.type === 'INCOME')
  const byDay = new Map<string, number>()
  for (const t of incomes) {
    const key = toYmd(new Date(t.date))
    byDay.set(key, (byDay.get(key) ?? 0) + t.amount)
  }

  const trend: RevenuePoint[] = Array.from({ length: days }, (_, i) => {
    const date = toYmd(new Date(start.getFullYear(), start.getMonth(), start.getDate() + i))
    return {
      date,
      label: days === 7 ? weekdayLabel(date) : dayMonthLabel(date),
      revenue: byDay.get(date) ?? 0,
    }
  })

  const countByMethod = (method: PaymentMethod) =>
    incomes.filter((t) => t.category === method).length

  return {
    days,
    from,
    to,
    revenue: report.totalIncome,
    expenseTotal: report.totalExpense,
    netProfit: report.netProfit,
    cashTotal: report.incomeByMethod.CASH,
    promptPayTotal: report.incomeByMethod.PROMPTPAY,
    cashCount: countByMethod(PaymentMethod.CASH),
    promptPayCount: countByMethod(PaymentMethod.PROMPTPAY),
    paymentCount: incomes.length,
    trend,
  }
}
