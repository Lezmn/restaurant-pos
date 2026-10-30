import { apiClient } from '@/lib/api-client'
import { mapSession } from '@/lib/map'
import type { ApiTableSession } from '@/types/api'
import { TableSessionStatus } from '@/types/enums'
import type { Id, TableSession } from '@/types/models'

/**
 * GET   /table-sessions            @Roles(ADMIN, STAFF)
 * POST  /table-sessions            @Roles(ADMIN, STAFF)
 * PATCH /table-sessions/:id/close  @Roles(ADMIN, STAFF)
 */
/**
 * ดึงเฉพาะโต๊ะที่เปิดอยู่ — ไม่กรองจะได้ทุก session ที่เคยเปิด (หลักพันพร้อมออเดอร์ ~7 MB)
 * หน้าที่ใช้ (เช็คบิล/โต๊ะ) ใช้แค่ OPEN และดึงซ้ำทุก 3 วิ
 */
export async function getSessions(): Promise<TableSession[]> {
  const data = await apiClient<ApiTableSession[]>(
    `/table-sessions?status=${TableSessionStatus.OPEN}`,
  )
  return data.map(mapSession)
}

export async function openSession(tableId: Id): Promise<TableSession> {
  const data = await apiClient<ApiTableSession>('/table-sessions', {
    method: 'POST',
    body: JSON.stringify({ tableId }),
  })
  return mapSession(data)
}

export async function closeSession(sessionId: Id): Promise<void> {
  await apiClient<unknown>(`/table-sessions/${sessionId}/close`, {
    method: 'PATCH',
  })
}
