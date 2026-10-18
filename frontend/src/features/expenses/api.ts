import { apiClient } from '@/lib/api-client'
import type { ApiExpense } from '@/types/api'
import type { ExpenseCategory } from '@/types/enums'
import type { Id } from '@/types/models'

export interface ExpenseInput {
  detail: string
  category: ExpenseCategory
  amount: number
}

/** เช็คฝั่งนี้ก่อนยิง ข้อความอ่านง่ายกว่าที่ class-validator ส่งกลับมา */
function assertValid(vars: ExpenseInput) {
  if (!vars.detail.trim()) throw new Error('กรุณากรอกรายละเอียด')
  if (!(vars.amount > 0)) throw new Error('จำนวนเงินต้องมากกว่า 0')
}

/** POST /expenses @Roles(ADMIN) — backend ใช้เวลาปัจจุบันเป็น spentAt ถ้าไม่ส่ง */
export async function addExpense(vars: ExpenseInput): Promise<ApiExpense> {
  assertValid(vars)

  return apiClient<ApiExpense>('/expenses', {
    method: 'POST',
    body: JSON.stringify({
      title: vars.detail.trim(),
      category: vars.category,
      amount: vars.amount,
    }),
  })
}

export interface DrawerExpenseInput {
  detail: string
  amount: number
  category?: ExpenseCategory
}

/**
 * POST /expenses/drawer @Roles(ADMIN, STAFF) — แคชเชียร์หยิบเงินสดจากลิ้นชักไปจ่าย
 * backend ใส่เวลาปัจจุบัน + ผู้บันทึกให้เอง แก้/ลบได้เฉพาะ ADMIN ที่หน้ารายรับ-รายจ่าย
 */
export async function addDrawerExpense(vars: DrawerExpenseInput): Promise<ApiExpense> {
  if (!vars.detail.trim()) throw new Error('กรุณากรอกว่าเอาไปจ่ายอะไร')
  if (!(vars.amount > 0)) throw new Error('จำนวนเงินต้องมากกว่า 0')

  return apiClient<ApiExpense>('/expenses/drawer', {
    method: 'POST',
    body: JSON.stringify({
      title: vars.detail.trim(),
      amount: vars.amount,
      category: vars.category,
    }),
  })
}

/** PATCH /expenses/:id @Roles(ADMIN) */
export async function updateExpense(vars: {
  id: Id
  input: ExpenseInput
}): Promise<ApiExpense> {
  assertValid(vars.input)

  return apiClient<ApiExpense>(`/expenses/${vars.id}`, {
    method: 'PATCH',
    body: JSON.stringify({
      title: vars.input.detail.trim(),
      category: vars.input.category,
      amount: vars.input.amount,
    }),
  })
}

/** DELETE /expenses/:id @Roles(ADMIN) */
export async function deleteExpense(id: Id): Promise<void> {
  await apiClient<void>(`/expenses/${id}`, { method: 'DELETE' })
}
