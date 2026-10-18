import { apiClient } from '@/lib/api-client'
import { mapMenuItem } from '@/lib/map'
import type { ApiCategory, ApiMenuItem } from '@/types/api'
import type { MenuOptionGroupKind } from '@/types/enums'
import type { Category, Id, MenuItem } from '@/types/models'

export async function getCategories(): Promise<Category[]> {
  const data = await apiClient<ApiCategory[]>('/categories')
  return data.map((c, index) => ({
    id: c.id,
    name: c.name,
    sortOrder: c.sortOrder ?? index,
  }))
}

export async function getMenuItems(): Promise<MenuItem[]> {
  const data = await apiClient<ApiMenuItem[]>('/menu')
  return data.map(mapMenuItem)
}

export async function getMenuItem(id: Id): Promise<MenuItem> {
  const data = await apiClient<ApiMenuItem>(`/menu/${id}`)
  return mapMenuItem(data)
}

export interface MenuItemInput {
  name: string
  price: number
  imageUrl: string | null
  categoryId: Id
  isAvailable: boolean
}

/** POST /menu @Roles(ADMIN) */
export async function createMenuItem(input: MenuItemInput): Promise<MenuItem> {
  const data = await apiClient<ApiMenuItem>('/menu', {
    method: 'POST',
    body: JSON.stringify(input),
  })
  return mapMenuItem(data)
}

/** PATCH /menu/:id @Roles(ADMIN) */
export async function updateMenuItem(vars: {
  id: Id
  input: Partial<MenuItemInput>
}): Promise<MenuItem> {
  const data = await apiClient<ApiMenuItem>(`/menu/${vars.id}`, {
    method: 'PATCH',
    body: JSON.stringify(vars.input),
  })
  return mapMenuItem(data)
}

/** DELETE /menu/:id @Roles(ADMIN) */
export async function deleteMenuItem(id: Id): Promise<void> {
  await apiClient<void>(`/menu/${id}`, { method: 'DELETE' })
}

// ===== ตัวเลือกของเมนู (หมู/ไก่/ไข่ดาว) — ทุก endpoint ต้องเป็น ADMIN =====

export interface MenuOptionInput {
  /** ผูกกับวัตถุดิบกลาง (null = ไม่ผูก) */
  ingredientId?: Id | null
  name: string
  price: number
  group: MenuOptionGroupKind
  isAvailable: boolean
}

/** POST /menu/:id/options — เพิ่มตัวเลือกให้เมนู */
export async function createMenuOption(vars: {
  menuItemId: Id
  input: MenuOptionInput
}): Promise<void> {
  await apiClient(`/menu/${vars.menuItemId}/options`, {
    method: 'POST',
    body: JSON.stringify(vars.input),
  })
}

/** PATCH /menu/:id/options/:optionId — แก้ชื่อ/ราคา/กลุ่ม หรือเปิด-ปิดให้เลือก */
export async function updateMenuOption(vars: {
  menuItemId: Id
  optionId: Id
  input: Partial<MenuOptionInput>
}): Promise<void> {
  await apiClient(`/menu/${vars.menuItemId}/options/${vars.optionId}`, {
    method: 'PATCH',
    body: JSON.stringify(vars.input),
  })
}

/**
 * DELETE /menu/:id/options/:optionId
 * backend ตอบ 400 ถ้าตัวเลือกเคยถูกสั่งไปแล้ว (ต้องเก็บไว้ให้ใบเสร็จเก่าอ้างถึงได้) — ให้ปิดแทน
 */
export async function deleteMenuOption(vars: {
  menuItemId: Id
  optionId: Id
}): Promise<void> {
  await apiClient(`/menu/${vars.menuItemId}/options/${vars.optionId}`, {
    method: 'DELETE',
  })
}

/** เปิด/ปิดการขาย — ใช้ PATCH ตัวเดียวกับการแก้ไขเมนู */
export async function setMenuItemAvailability(vars: {
  id: Id
  isAvailable: boolean
}): Promise<MenuItem> {
  return updateMenuItem({
    id: vars.id,
    input: { isAvailable: vars.isAvailable },
  })
}
