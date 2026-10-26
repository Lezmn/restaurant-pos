import type { ApiKitchenStats } from './api'
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

export interface SalesItem {
  menuItemId: Id
  name: string
  categoryName: string
  quantity: number
  revenue: number
}

export interface SalesHour {
  hour: number
  orderCount: number
  quantity: number
  revenue: number
}

export interface SalesData {
  month: string
  orderCount: number
  totalQuantity: number
  totalRevenue: number
  topItems: SalesItem[]
  unsoldItems: Pick<SalesItem, 'menuItemId' | 'name' | 'categoryName'>[]
  byHour: SalesHour[]
  /** [วัน 0=อาทิตย์..6][ชั่วโมง 0..23] = จำนวนออเดอร์ */
  byWeekdayHour: number[][]
  kitchen: KitchenStats
}

export type KitchenStats = ApiKitchenStats

/** ช่วงที่ดูบน Dashboard นอกจาก "วันนี้" */
export type DashboardPeriodDays = 7 | 30

/** สรุปหลายวันบน Dashboard (7 / 30 วันล่าสุด รวมวันนี้) */
export interface PeriodData {
  days: DashboardPeriodDays
  /** วันแรก / วันสุดท้ายของช่วง (YYYY-MM-DD ตามเวลาเครื่อง) */
  from: string
  to: string
  revenue: number
  expenseTotal: number
  netProfit: number
  cashTotal: number
  promptPayTotal: number
  cashCount: number
  promptPayCount: number
  paymentCount: number
  /** รายรับรายวัน ครบทุกวันในช่วง (วันที่ไม่มีบิล = 0) */
  trend: RevenuePoint[]
}
