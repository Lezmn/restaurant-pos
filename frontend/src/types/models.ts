import type {
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

// id ทุกตัวเป็น uuid string ตาม prisma schema (@default(uuid()))
export type Id = string

export interface User {
  id: Id
  email: string
  name: string
  role: Role
  /** true = ต้องตั้งรหัสใหม่ก่อนใช้งาน (รหัสชั่วคราวตอนส่งมอบ / ADMIN อีกคนตั้งให้) */
  mustChangePassword?: boolean
}

export interface Category {
  id: Id
  name: string
  sortOrder: number
}

export interface MenuOption {
  id: Id
  name: string
  price: number
  /** PROTEIN / EXTRA — หน้าจัดการใช้แสดง/แก้กลุ่ม ส่วนหน้าลูกค้าใช้ optionGroups ที่จับกลุ่มแล้ว */
  group: MenuOptionGroupKind
  isAvailable: boolean
  /** วัตถุดิบที่ผูกไว้ (null = ไม่ผูก) — ถ้าวัตถุดิบหมด ตัวเลือกนี้ก็สั่งไม่ได้ */
  ingredientId: Id | null
  ingredientName: string | null
  /** วัตถุดิบหมดอยู่หรือเปล่า — ใช้บอกในหน้าจัดการว่าทำไมตัวเลือกนี้สั่งไม่ได้ */
  ingredientOutOfStock: boolean
  /** ยอดคงเหลือของวัตถุดิบที่ผูกไว้ (null = ไม่นับสต็อก หรือไม่ได้ผูก) */
  ingredientStockQty: number | null
  /** ใช้วัตถุดิบกี่หน่วยต่อจาน — 0 = ผูกไว้ให้หมดตามอย่างเดียว ไม่ตัดสต็อก */
  usageQty: number
}

/** วัตถุดิบกลางของร้าน — ผูกกับตัวเลือกเมนูและเมนูได้หลายอัน ปิดทีเดียวหมดทุกเมนู */
export interface Ingredient {
  id: Id
  name: string
  isAvailable: boolean
  menuOptionCount: number
  /** จำนวนเมนูที่ใช้เป็นวัตถุดิบหลัก (ข้าวไข่เจียว → ไข่) */
  menuItemCount: number
  /** ยอดคงเหลือ — null = ไม่นับสต็อก (เปิด/ปิดด้วยมือ) */
  stockQty: number | null
  /** เหลือเท่านี้หรือน้อยกว่าขึ้นเตือน "ใกล้หมด" */
  lowStockAt: number | null
}

/** วัตถุดิบที่เมนูอ้างถึง — พอให้รู้ชื่อกับว่าหมดหรือยัง */
export interface IngredientRef {
  id: Id
  name: string
  isAvailable: boolean
}

// ตัวเลือกแยกเป็น 2 แบบ: "เนื้อสัตว์" (group=PROTEIN) เลือกได้อันเดียว (radio)
// กับ "เพิ่มเติม" (group=EXTRA) เลือกได้หลายอัน (checkbox)
// backend ส่ง MenuOption มาเป็น flat list พร้อมฟิลด์ group — จับกลุ่มที่ lib/map.ts
export interface MenuOptionGroup {
  id: Id
  name: string
  selectType: 'single' | 'multiple'
  required: boolean
  options: MenuOption[]
}

export interface MenuItem {
  id: Id
  categoryId: Id
  name: string
  price: number
  imageUrl: string | null
  /** สวิตช์เปิด/ปิดขายของเมนูเอง (ไม่รวมวัตถุดิบ) */
  isAvailable: boolean
  optionGroups: MenuOptionGroup[]
  /** วัตถุดิบหลักที่เมนูใช้เสมอ — ตัวไหนหมด ทั้งเมนูสั่งไม่ได้ */
  ingredients: IngredientRef[]
  /** ชื่อวัตถุดิบหลักที่หมดอยู่ (ว่าง = สั่งได้ ถ้าเมนูเปิดขาย) */
  ingredientsOutOfStock: string[]
}

export interface RestaurantTable {
  id: Id
  name: string
  seats: number
  status: TableStatus
}

export interface TableSession {
  id: Id
  tableId: Id
  tableName: string
  token: string
  status: TableSessionStatus
  openedAt: string
  closedAt: string | null
  /** จำนวนลูกค้า (null = ไม่ได้ระบุ) */
  guestCount: number | null
  /** ยอดที่ต้องจ่ายของโต๊ะนี้ — backend คำนวณมาให้ ไม่ได้บวกเองฝั่ง frontend */
  total: number
}

export interface OrderItem {
  id: Id
  menuItemId: Id
  menuItemName: string
  imageUrl: string | null
  quantity: number
  unitPrice: number
  note: string | null
  optionNames: string[]
  /** ราคาตัวเลือกที่บวกเพิ่มต่อ 1 จาน (backend คิด (unitPrice + optionsTotal) * quantity) */
  optionsTotal: number
}

export interface Order {
  id: Id
  /** backend ไม่มีเลขที่ออเดอร์ — ใช้ 6 ตัวแรกของ uuid แสดงแทนให้พนักงานอ้างอิงกันได้ */
  orderRef: string
  tableSessionId: Id
  tableName: string
  status: OrderStatus
  createdAt: string
  /** ครัวยกให้ลูกค้าแล้วเมื่อไหร่ — null = ยังอยู่บนบอร์ดครัว */
  clearedAt: string | null
  items: OrderItem[]
}

export interface ReceiptItem {
  id: Id
  name: string
  quantity: number
  unitPrice: number
  optionTotal: number
  lineTotal: number
  note: string | null
}

export interface Receipt {
  id: Id
  number: string
  subtotal: number
  discount: number
  total: number
  issuedAt: string
  tableName: string
  /** หมายเหตุท้ายใบเสร็จ — เก็บใน DB แล้ว เปิดดูย้อนหลังก็ยังอยู่ */
  note: string | null
  items: ReceiptItem[]
}

export interface Payment {
  id: Id
  tableSessionId: Id
  tableName: string
  method: PaymentMethod
  status: PaymentStatus
  amount: number
  paidAt: string
  /** ถ้าบิลถูกยกเลิก — เวลาและเหตุผลที่พนักงานกรอก */
  voidedAt: string | null
  voidReason: string | null
  note: string | null
  receipt: Receipt | null
  /** ผลตรวจสลิป PromptPay — null = เงินสด หรือบิลก่อนมีระบบตรวจสลิป */
  slip: PaymentSlip | null
}

export interface PaymentSlip {
  status: SlipStatus
  transRef: string | null
  /** ผล/เหตุผลล่าสุด เช่น "ข้อมูลธนาคารขัดข้องชั่วคราว" */
  message: string | null
  attempts: number
  /** ADMIN ยืนยันเอง — เหตุผลกับชื่อคนยืนยัน */
  overrideReason: string | null
  overrideByName: string | null
}

export interface ServiceRequest {
  id: Id
  tableSessionId: Id
  tableName: string
  type: ServiceRequestType
  status: ServiceRequestStatus
  paymentMethod: PaymentMethod | null
  note: string | null
  createdAt: string
}
