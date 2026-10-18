import { getPayments } from '@/features/payments/api'
import { apiClient } from '@/lib/api-client'
import type { ApiDashboardReport, ApiIncomeExpenseReport } from '@/types/api'
import { PaymentMethod, PaymentStatus, TableStatus } from '@/types/enums'
import type { Payment } from '@/types/models'
import type {
  DashboardData,
  FinanceData,
  Notification,
  RevenuePoint,
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
