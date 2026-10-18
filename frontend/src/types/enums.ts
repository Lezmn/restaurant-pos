// ให้ตรงกับ enum ใน prisma/schema.prisma ของฝั่ง backend
// ใช้ const object แทน TS enum เพราะ tsconfig เปิด erasableSyntaxOnly ไว้

export const Role = {
  ADMIN: 'ADMIN',
  STAFF: 'STAFF',
  KITCHEN: 'KITCHEN',
} as const
export type Role = (typeof Role)[keyof typeof Role]

export const OrderStatus = {
  PENDING: 'PENDING',
  PREPARING: 'PREPARING',
  SERVED: 'SERVED',
  PAID: 'PAID',
  CANCELLED: 'CANCELLED',
} as const
export type OrderStatus = (typeof OrderStatus)[keyof typeof OrderStatus]

export const TableStatus = {
  AVAILABLE: 'AVAILABLE',
  OCCUPIED: 'OCCUPIED',
  RESERVED: 'RESERVED',
} as const
export type TableStatus = (typeof TableStatus)[keyof typeof TableStatus]

export const TableSessionStatus = {
  OPEN: 'OPEN',
  CLOSED: 'CLOSED',
  EXPIRED: 'EXPIRED',
} as const
export type TableSessionStatus =
  (typeof TableSessionStatus)[keyof typeof TableSessionStatus]

/** ร้านรับแค่เงินสดกับ PromptPay — ฝั่ง DB ยังมี CARD ค้างอยู่แต่ไม่ได้ใช้ */
export const PaymentMethod = {
  CASH: 'CASH',
  PROMPTPAY: 'PROMPTPAY',
} as const
export type PaymentMethod = (typeof PaymentMethod)[keyof typeof PaymentMethod]

export const PaymentStatus = {
  COMPLETED: 'COMPLETED',
  VOIDED: 'VOIDED',
} as const
export type PaymentStatus = (typeof PaymentStatus)[keyof typeof PaymentStatus]

/** ผลตรวจสลิป PromptPay ผ่าน SlipOK (prisma enum SlipStatus) — เงินสดเป็น null */
export const SlipStatus = {
  VERIFIED: 'VERIFIED',
  PENDING: 'PENDING',
  FAILED: 'FAILED',
  MANUAL: 'MANUAL',
} as const
export type SlipStatus = (typeof SlipStatus)[keyof typeof SlipStatus]

/** หมวดรายจ่ายของร้าน (prisma enum ExpenseCategory) */
export const ExpenseCategory = {
  INGREDIENTS: 'INGREDIENTS',
  UTILITIES: 'UTILITIES',
  SALARY: 'SALARY',
  EQUIPMENT: 'EQUIPMENT',
  RENT: 'RENT',
  OTHER: 'OTHER',
} as const
export type ExpenseCategory =
  (typeof ExpenseCategory)[keyof typeof ExpenseCategory]

export const ServiceRequestType = {
  CALL_STAFF: 'CALL_STAFF',
  CHECKOUT: 'CHECKOUT',
  OTHER: 'OTHER',
} as const
export type ServiceRequestType =
  (typeof ServiceRequestType)[keyof typeof ServiceRequestType]

/**
 * กลุ่มของตัวเลือกเมนู (prisma enum MenuOptionGroup)
 * ตั้งชื่อว่า ...Kind กันชนกับ MenuOptionGroup ใน types/models.ts
 * ซึ่งเป็นกลุ่มที่ประกอบเสร็จแล้วสำหรับหน้าจอ
 */
export const MenuOptionGroupKind = {
  /** เนื้อสัตว์ — เลือกได้อย่างเดียว */
  PROTEIN: 'PROTEIN',
  /** ท็อปปิ้ง/เพิ่มเติมอื่น ๆ — เลือกได้หลายอัน */
  EXTRA: 'EXTRA',
} as const
export type MenuOptionGroupKind =
  (typeof MenuOptionGroupKind)[keyof typeof MenuOptionGroupKind]

export const ServiceRequestStatus = {
  PENDING: 'PENDING',
  RESOLVED: 'RESOLVED',
  CANCELLED: 'CANCELLED',
} as const
export type ServiceRequestStatus =
  (typeof ServiceRequestStatus)[keyof typeof ServiceRequestStatus]
