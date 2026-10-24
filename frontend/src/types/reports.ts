import type { ExpenseCategory, PaymentMethod } from './enums'
import type { Id } from './models'

export interface DailySummary {
  /** วันที่ของสรุปชุดนี้ (ISO) */
  date: string
  revenue: number
  expenseTotal: number
  netProfit: number
  cashTotal: number
  promptPayTotal: number
  orderCount: number
  paymentCount: number
}

export interface RevenuePoint {
  /** ป้ายแกน X เช่น "จ." "อ." */
  label: string
  date: string
  revenue: number
}

export interface TodayStatus {
  cashCount: number
  promptPayCount: number
  tablesInUse: number
  tablesTotal: number
}

/** บิลที่รับเงินวันนี้ — ใช้เป็นรายการแจ้งเตือนบน Dashboard */
export interface Notification {
  id: Id
  tableName: string
  method: PaymentMethod
  amount: number
  createdAt: string
}

export interface DashboardData {
  summary: DailySummary
  trend: RevenuePoint[]
  todayStatus: TodayStatus
  notifications: Notification[]
  /** บิล PromptPay ที่ยังยืนยันเงินเข้าไม่ได้ (ทุกวัน) */
  slipIssues: { pending: number; failed: number }
}

export interface Transaction {
  id: Id
  type: 'INCOME' | 'EXPENSE'
  date: string
  detail: string
  /** รายรับใช้ PaymentMethod, รายจ่ายใช้ ExpenseCategory */
  category: PaymentMethod | ExpenseCategory
  /** บวก = รายรับ, ลบ = รายจ่าย */
  amount: number
  /** รายจ่ายที่พนักงานหยิบเงินสดจากลิ้นชักไปจ่าย */
  paidFromDrawer: boolean
  createdByName: string | null
}

export interface FinanceSummary {
  netProfit: number
  expenseTotal: number
  revenueTotal: number
  cashTotal: number
  promptPayTotal: number
  paymentCount: number
}

export interface FinanceData {
  /** เดือนที่ดู (YYYY-MM) */
  month: string
  summary: FinanceSummary
  transactions: Transaction[]
}
