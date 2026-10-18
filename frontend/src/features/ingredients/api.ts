import { apiClient } from '@/lib/api-client'
import type { ApiIngredient } from '@/types/api'
import type { Id, Ingredient } from '@/types/models'

const mapIngredient = (i: ApiIngredient): Ingredient => ({
  id: i.id,
  name: i.name,
  isAvailable: i.isAvailable,
  /** จำนวนตัวเลือกเมนูที่ผูกอยู่ */
  menuOptionCount: i._count?.menuOptions ?? 0,
})

/** GET /ingredients — ทุก role ที่ login แล้วดูได้ (ครัวต้องเห็นว่าอะไรหมด) */
export async function getIngredients(): Promise<Ingredient[]> {
  const data = await apiClient<ApiIngredient[]>('/ingredients')
  return data.map(mapIngredient)
}

/** POST /ingredients @Roles(ADMIN) — ชื่อซ้ำ backend ตอบ 409 */
export async function createIngredient(name: string): Promise<Ingredient> {
  if (!name.trim()) throw new Error('กรุณากรอกชื่อวัตถุดิบ')
  const data = await apiClient<ApiIngredient>('/ingredients', {
    method: 'POST',
    body: JSON.stringify({ name: name.trim() }),
  })
  return mapIngredient(data)
}

/**
 * PATCH /ingredients/:id @Roles(ADMIN, KITCHEN)
 * ปิดวัตถุดิบ = ตัวเลือกเมนูที่ผูกไว้สั่งไม่ได้ทุกเมนูทันที
 */
export async function updateIngredient(vars: {
  id: Id
  name?: string
  isAvailable?: boolean
}): Promise<Ingredient> {
  const data = await apiClient<ApiIngredient>(`/ingredients/${vars.id}`, {
    method: 'PATCH',
    body: JSON.stringify({
      ...(vars.name === undefined ? {} : { name: vars.name.trim() }),
      ...(vars.isAvailable === undefined
        ? {}
        : { isAvailable: vars.isAvailable }),
    }),
  })
  return mapIngredient(data)
}

/**
 * DELETE /ingredients/:id @Roles(ADMIN)
 * ตัวเลือกเมนูที่ผูกอยู่: ไม่เคยถูกสั่ง → ลบ, เคยถูกสั่งแล้ว → ปิดขาย + ปลดวัตถุดิบ
 */
export async function deleteIngredient(id: Id): Promise<void> {
  await apiClient<void>(`/ingredients/${id}`, { method: 'DELETE' })
}
