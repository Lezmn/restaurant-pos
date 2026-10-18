import { Role } from '@/types/enums'

/**
 * สิทธิ์เข้าหน้าต่าง ๆ — ตั้งให้ตรงกับ @Roles(...) ของ controller ฝั่ง NestJS
 * เพื่อไม่ให้ UI พาผู้ใช้ไปเจอ 403
 *
 * order   → PATCH /orders/:id/status   @Roles(ADMIN, KITCHEN)
 * check   → /service-requests, /table-sessions, /payments
 *                                      @Roles(ADMIN, STAFF)
 * manage  → POST/PATCH/DELETE /menu    @Roles(ADMIN)
 * users   → ทั้ง controller            @Roles(ADMIN)
 *
 * หมายเหตุ: นี่เป็นการกัน UI เท่านั้น ไม่ใช่ security จริง
 * ตัวจริงคือ JwtAuthGuard + RolesGuard ที่ backend
 */
type PageKey =
  | 'order'
  | 'check'
  | 'manage'
  | 'orders'
  | 'tables'
  | 'requests'
  | 'users'
  | 'openTable'
  | 'owner'

// ประกาศ type ตรง ๆ แทน satisfies เพราะ satisfies จะแคบค่าเป็น literal tuple
// ทำให้ .includes(role) ฟ้อง error เวลา role เป็นตัวที่ไม่ได้อยู่ในลิสต์นั้น
export const pageRoles: Record<PageKey, Role[]> = {
  order: [Role.ADMIN, Role.KITCHEN],
  check: [Role.ADMIN, Role.STAFF],
  manage: [Role.ADMIN, Role.KITCHEN],
  orders: [Role.ADMIN, Role.STAFF],
  tables: [Role.ADMIN, Role.STAFF],
  requests: [Role.ADMIN, Role.STAFF],
  users: [Role.ADMIN],
  /** เปิดโต๊ะ/สร้าง QR — POST /table-sessions @Roles(ADMIN, STAFF) */
  openTable: [Role.ADMIN, Role.STAFF],
  /** ฝั่งเจ้าของร้าน — backend ไม่มี role OWNER แยก ใช้ ADMIN แทน */
  owner: [Role.ADMIN],
}

/** หน้าแรกหลัง login ของแต่ละ role — ต้องเป็นหน้าที่ role นั้นเข้าได้จริง ไม่งั้น redirect วนลูป */
export const homeByRole: Record<Role, string> = {
  [Role.ADMIN]: '/employee/order',
  [Role.KITCHEN]: '/employee/order',
  [Role.STAFF]: '/employee/check',
}
