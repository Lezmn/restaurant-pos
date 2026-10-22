import { apiClient } from '@/lib/api-client'
import { LOGIN_EMAIL_DOMAIN } from '@/lib/config'
import type { Role } from '@/types/enums'
import type { Id } from '@/types/models'

/** GET /users — backend ไม่เคยส่ง password กลับมา (USER_SELECT) */
interface ApiStaffUser {
  id: string
  name: string
  email: string
  role: Role
  isActive: boolean
  createdAt: string
}

/** บัญชีผู้ใช้ในหน้าจัดการ — ร้านใช้บัญชีกลางตามตำแหน่ง (ครัว 1 บัญชี, หน้าร้าน 1 บัญชี) */
export interface StaffUser {
  id: Id
  name: string
  email: string
  /** ชื่อที่ใช้ login — ตัดโดเมนของร้านออก ("staff2@restaurant.local" → "staff2") */
  username: string
  role: Role
  isActive: boolean
  createdAt: string
}

const DOMAIN_SUFFIX = `@${LOGIN_EMAIL_DOMAIN}`

const mapStaffUser = (u: ApiStaffUser): StaffUser => ({
  ...u,
  username: u.email.endsWith(DOMAIN_SUFFIX) ? u.email.slice(0, -DOMAIN_SUFFIX.length) : u.email,
})

/** GET /users @Roles(ADMIN) */
export async function getUsers(): Promise<StaffUser[]> {
  const data = await apiClient<ApiStaffUser[]>('/users')
  return data.map(mapStaffUser)
}

export interface CreateUserInput {
  name: string
  /** อีเมลเต็มแล้ว (หน้าฟอร์มเติมโดเมนให้จากชื่อผู้ใช้) */
  email: string
  password: string
  role: Role
}

/** POST /users @Roles(ADMIN) — อีเมลซ้ำ backend ตอบ 400 */
export async function createUser(input: CreateUserInput): Promise<StaffUser> {
  const data = await apiClient<ApiStaffUser>('/users', {
    method: 'POST',
    body: JSON.stringify(input),
  })
  return mapStaffUser(data)
}

export interface UpdateUserInput {
  name?: string
  role?: Role
  /** ตั้งรหัสผ่านใหม่ให้พนักงาน (ลืมรหัส) */
  password?: string
  /** false = ปิดใช้งาน — login ไม่ได้ และเครื่องที่ login ค้างไว้หลุดทันที */
  isActive?: boolean
  /** true = เตะทุกเครื่องที่ใช้บัญชีนี้อยู่ ให้ login ใหม่ (ใช้คู่กับตั้งรหัสใหม่ตอนมีคนลาออก) */
  logoutEverywhere?: boolean
}

/** PATCH /users/:id @Roles(ADMIN) */
export async function updateUser(vars: { id: Id; input: UpdateUserInput }): Promise<StaffUser> {
  const data = await apiClient<ApiStaffUser>(`/users/${vars.id}`, {
    method: 'PATCH',
    body: JSON.stringify(vars.input),
  })
  return mapStaffUser(data)
}

/** DELETE /users/:id @Roles(ADMIN) — คนที่มีประวัติปิดยอด/เบิกเงิน backend ตอบ 400 ให้ปิดใช้งานแทน */
export async function deleteUser(id: Id): Promise<void> {
  await apiClient<unknown>(`/users/${id}`, { method: 'DELETE' })
}
