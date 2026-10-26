import { apiClient } from '@/lib/api-client'
import { mapSession } from '@/lib/map'
import type { ApiTableSession } from '@/types/api'
import type { Id, TableSession } from '@/types/models'

/**
 * GET   /table-sessions            @Roles(ADMIN, STAFF)
 * POST  /table-sessions            @Roles(ADMIN, STAFF)
 * PATCH /table-sessions/:id/close  @Roles(ADMIN, STAFF)
 */
export async function getSessions(): Promise<TableSession[]> {
  const data = await apiClient<ApiTableSession[]>('/table-sessions')
  return data.map(mapSession)
}

export async function openSession(tableId: Id): Promise<TableSession> {
  const data = await apiClient<ApiTableSession>('/table-sessions', {
    method: 'POST',
    body: JSON.stringify({ tableId }),
  })
  return mapSession(data)
}

/** PATCH /table-sessions/:id/move — ย้ายทั้งบิลไปโต๊ะที่ว่าง (QR เดิมยังใช้ได้) */
export async function moveSession(vars: { sessionId: Id; tableId: Id }): Promise<TableSession> {
  const data = await apiClient<ApiTableSession>(`/table-sessions/${vars.sessionId}/move`, {
    method: 'PATCH',
    body: JSON.stringify({ tableId: vars.tableId }),
  })
  return mapSession(data)
}

/** PATCH /table-sessions/:id/merge — ออเดอร์ที่ยังไม่จ่ายย้ายไปบิลปลายทาง แล้วปิดบิลนี้ */
export async function mergeSession(vars: {
  sessionId: Id
  targetSessionId: Id
}): Promise<TableSession> {
  const data = await apiClient<ApiTableSession>(`/table-sessions/${vars.sessionId}/merge`, {
    method: 'PATCH',
    body: JSON.stringify({ targetSessionId: vars.targetSessionId }),
  })
  return mapSession(data)
}

export async function closeSession(sessionId: Id): Promise<void> {
  await apiClient<unknown>(`/table-sessions/${sessionId}/close`, {
    method: 'PATCH',
  })
}
