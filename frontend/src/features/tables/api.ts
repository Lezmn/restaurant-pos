import { apiClient } from '@/lib/api-client'
import { mapTable } from '@/lib/map'
import type { ApiTable } from '@/types/api'
import type { Id, RestaurantTable } from '@/types/models'

/** GET /tables — ปกติเฉพาะโต๊ะที่ใช้งาน, includeInactive = รวมที่ปิดไว้ (หน้าจัดการโต๊ะของ ADMIN) */
export async function getTables(includeInactive = false): Promise<RestaurantTable[]> {
  const data = await apiClient<ApiTable[]>(includeInactive ? '/tables?includeInactive=true' : '/tables')
  return data.map(mapTable)
}

export interface TableInput {
  number: number
  seats: number
}

/** POST /tables @Roles(ADMIN) — เลขซ้ำได้ 409 */
export async function createTable(input: TableInput): Promise<RestaurantTable> {
  return mapTable(await apiClient<ApiTable>('/tables', { method: 'POST', body: JSON.stringify(input) }))
}

/** PATCH /tables/:id @Roles(ADMIN) — isActive: false ได้เฉพาะโต๊ะที่ไม่มีลูกค้านั่งอยู่ */
export async function updateTable(vars: {
  id: Id
  input: Partial<TableInput> & { isActive?: boolean }
}): Promise<RestaurantTable> {
  return mapTable(
    await apiClient<ApiTable>(`/tables/${vars.id}`, { method: 'PATCH', body: JSON.stringify(vars.input) }),
  )
}

/** DELETE /tables/:id @Roles(ADMIN) — โต๊ะที่มีประวัติการขายลบไม่ได้ (409) ให้ปิดใช้งานแทน */
export async function deleteTable(id: Id): Promise<void> {
  await apiClient<unknown>(`/tables/${id}`, { method: 'DELETE' })
}
