/**
 * รูปร่างข้อมูลดิบที่ API ส่งกลับมาจริง ๆ (ตรวจจาก response ของ NestJS)
 * ต่างจาก type ในโดเมนของ frontend หลายจุด เช่น
 *   - โต๊ะใช้ `number` (ตัวเลข) ไม่ใช่ `name`
 *   - ตัวเลือกเมนูเป็น array แบน มีแค่ฟิลด์ group บอกกลุ่ม ต้องจับกลุ่มเองฝั่ง frontend
 *   - ออเดอร์ไม่มีเลขที่ (order number)
 * จึงมีชั้นแปลงอยู่ที่ lib/map.ts เพื่อไม่ให้ความต่างพวกนี้รั่วเข้าไปในหน้าจอ
 */
import type {
  ExpenseCategory,
  MenuOptionGroupKind,
  OrderStatus,
  PaymentMethod,
  PaymentStatus,
  Role,
  ServiceRequestStatus,
  ServiceRequestType,
  SlipStatus,
  TableSessionStatus,
  TableStatus,
} from './enums'

export interface ApiUser {
  id: string
  name: string
  email: string
  role: Role
}

export interface ApiLoginResponse {
  accessToken: string
  user: ApiUser
}

export interface ApiTable {
  id: string
  number: number
  seats: number
  status: TableStatus
}

export interface ApiMenuOption {
  id: string
  name: string
  price: number
  /** PROTEIN = เนื้อสัตว์, EXTRA = เพิ่มเติม — backend default เป็น EXTRA */
  group?: MenuOptionGroupKind
  isAvailable: boolean
  /** ผูกกับวัตถุดิบกลาง — วัตถุดิบหมดแล้วตัวเลือกนี้สั่งไม่ได้ทุกเมนู */
  ingredientId?: string | null
  ingredient?: { id: string; name: string; isAvailable: boolean } | null
}

/** GET /ingredients — _count มาเฉพาะตอนดึงเป็นรายการ */
export interface ApiIngredient {
  id: string
  name: string
  isAvailable: boolean
  _count?: { menuOptions: number }
}

export interface ApiMenuItem {
  id: string
  name: string
  price: number
  imageUrl: string | null
  isAvailable: boolean
  categoryId: string
  category?: { id: string; name: string }
  options?: ApiMenuOption[]
}

export interface ApiCategory {
  id: string
  name: string
  sortOrder?: number
  menuItems?: ApiMenuItem[]
}

/**
 * order item มาได้ 2 ทรง
 * - /orders (พนักงาน)  : menuItemId + menuItem{} + selectedOptions[]
 * - /public/... (ลูกค้า): name + options[] แบนมาแล้ว ไม่มี menuItemId/รูป
 */
export interface ApiOrderItem {
  id: string
  quantity: number
  unitPrice: number
  note: string | null
  menuItemId?: string
  menuItem?: { id: string; name: string; imageUrl?: string | null }
  selectedOptions?: { id: string; name: string; price: number }[]
  name?: string
  options?: { id: string; name: string; price: number }[]
}

export interface ApiOrder {
  id: string
  status: OrderStatus
  createdAt: string
  /** ครัวกดว่ายกให้ลูกค้าแล้ว — null = ยังอยู่บนบอร์ดครัว */
  clearedAt?: string | null
  tableId?: string
  tableSessionId?: string | null
  table?: ApiTable
  items: ApiOrderItem[]
  /** เฉพาะทรง /public — backend รวมยอดของออเดอร์มาให้แล้ว */
  total?: number
}

export interface ApiTableSession {
  id: string
  token: string
  status: TableSessionStatus
  openedAt: string
  closedAt: string | null
  expiresAt: string | null
  tableId: string
  table?: ApiTable
  orders?: ApiOrder[]
  /** backend คำนวณยอดรวมของ session มาให้แล้ว ไม่ต้องบวกเองฝั่ง frontend */
  total?: number
  billingStatus?: string
  checkoutRequest?: ApiServiceRequest | null
}

export interface ApiServiceRequest {
  id: string
  type: ServiceRequestType
  status: ServiceRequestStatus
  createdAt: string
  resolvedAt: string | null
  paymentMethod: PaymentMethod | null
  tableId: string
  tableSessionId: string | null
  table?: ApiTable
}

export interface ApiReceiptItem {
  id: string
  name: string
  quantity: number
  unitPrice: number
  optionTotal: number
  lineTotal: number
  note: string | null
}

export interface ApiReceipt {
  id: string
  number: string
  subtotal: number
  discount: number
  total: number
  issuedAt: string
  tableId: string
  /** หมายเหตุพิมพ์ท้ายใบเสร็จ (สำเนาจาก payment.note) */
  note: string | null
  items?: ApiReceiptItem[]
}

export interface ApiPayment {
  id: string
  amount: number
  method: PaymentMethod
  status: PaymentStatus
  paidAt: string
  voidedAt: string | null
  voidReason: string | null
  /** หมายเหตุที่พนักงานพิมพ์ตอนรับเงิน */
  note: string | null
  tableSessionId: string
  receipt?: ApiReceipt | null
  tableSession?: ApiTableSession
  // ---- ตรวจสลิป PromptPay (SlipOK) ----
  slipStatus?: SlipStatus | null
  slipTransRef?: string | null
  slipMessage?: string | null
  slipAttempts?: number
  slipOverrideReason?: string | null
  slipOverrideByName?: string | null
}

/** GET /reports/dashboard @Roles(ADMIN) — สรุปของ "วันนี้" ตามเวลาของ server + เทรนด์ 7 วัน */
export interface ApiDashboardReport {
  /** เวลาเริ่มวันที่ใช้คำนวณ (ISO) — ใช้ตัดช่วง "วันนี้" ให้ตรงกับ backend */
  date: string
  revenue: number
  expenses: number
  netProfit: number
  orderCount: number
  paymentCount: number
  revenueByMethod: Record<PaymentMethod, number>
  tables: Record<TableStatus, number> & { total: number }
  /** date เป็น YYYY-MM-DD ครบทุกวัน (วันที่ไม่มียอดเป็น 0) */
  revenueTrend: { date: string; revenue: number }[]
  /** บิล PromptPay ที่ยังยืนยันเงินเข้าไม่ได้ (ทุกวัน) */
  slipIssues?: { pending: number; failed: number }
}

/** GET /reports/income-expense?month=YYYY-MM @Roles(ADMIN) */
export interface ApiIncomeExpenseReport {
  range: { from: string | null; to: string | null }
  totalIncome: number
  totalExpense: number
  netProfit: number
  incomeByMethod: Record<PaymentMethod, number>
  expenseByCategory: Record<ExpenseCategory, number>
  /** รายรับ (จาก Payment) กับรายจ่าย (จาก Expense) รวมมาในลิสต์เดียว ล่าสุดก่อน */
  transactions: (
    | {
        type: 'INCOME'
        id: string
        date: string
        title: string
        category: PaymentMethod
        amount: number
        paidFromDrawer: false
        createdByName: null
      }
    | {
        type: 'EXPENSE'
        id: string
        date: string
        title: string
        category: ExpenseCategory
        amount: number
        /** พนักงานหยิบเงินสดจากลิ้นชักไปจ่าย */
        paidFromDrawer: boolean
        /** null = รายการเก่าก่อนมีการเก็บผู้บันทึก */
        createdByName: string | null
      }
  )[]
}

/** /expenses @Roles(ADMIN) */
export interface ApiExpense {
  id: string
  title: string
  amount: number
  category: ExpenseCategory
  note: string | null
  spentAt: string
  paidFromDrawer: boolean
  createdByName: string | null
}

/** รายการหยิบเงินออกจากลิ้นชักของวัน (ใน preview ปิดยอด) */
export interface ApiDrawerExpenseItem {
  id: string
  title: string
  amount: number
  spentAt: string
  createdByName: string | null
}

/** POST /cash-closes, GET /cash-closes — date เป็น YYYY-MM-DD */
export interface ApiCashClose {
  id: string
  date: string
  openingFloat: number
  cashSales: number
  drawerExpenses: number
  expectedCash: number
  countedCash: number
  /** countedCash - expectedCash: บวก = เงินเกิน, ลบ = เงินขาด */
  difference: number
  promptpaySales: number
  note: string | null
  closedAt: string
  closedById: string | null
  closedByName: string
}

/** GET /cash-closes/preview?date= @Roles(ADMIN, STAFF) */
export interface ApiCashClosePreview {
  date: string
  cashSales: number
  promptpaySales: number
  drawerExpenses: number
  paymentCount: number
  drawerExpenseItems: ApiDrawerExpenseItem[]
  /** โต๊ะที่ยังมีออเดอร์ค้างจ่าย — ปิดยอดก่อน เงินที่เก็บทีหลังจะไม่อยู่ในยอดวันนี้ */
  unpaidTableCount: number
  /** เงินทอนตั้งต้นของการปิดยอดครั้งก่อน ไว้เติมให้ */
  suggestedOpeningFloat: number | null
  alreadyClosed: ApiCashClose | null
}
