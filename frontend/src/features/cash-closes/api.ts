import { apiClient } from '@/lib/api-client'
import type { ApiCashClose, ApiCashClosePreview } from '@/types/api'
import type { Id } from '@/types/models'

export interface CashCloseInput {
  openingFloat: number
  countedCash: number
  note?: string
}

/** GET /cash-closes/preview @Roles(ADMIN, STAFF) — ไม่ส่ง date = วันนี้ตามเวลา server */
export async function getCashClosePreview(): Promise<ApiCashClosePreview> {
  return apiClient<ApiCashClosePreview>('/cash-closes/preview')
}

/** POST /cash-closes @Roles(ADMIN, STAFF) — ปิดยอดของวันนี้ (วันละครั้ง ซ้ำได้ 409) */
export async function createCashClose(vars: CashCloseInput): Promise<ApiCashClose> {
  // isFinite กัน NaN (ช่องว่าง) ด้วย — `x < 0` เฉย ๆ ปล่อย NaN ผ่าน
  if (!Number.isFinite(vars.openingFloat) || vars.openingFloat < 0) throw new Error('กรุณากรอกเงินทอนตั้งต้น')
  if (!Number.isFinite(vars.countedCash) || vars.countedCash < 0) throw new Error('กรุณากรอกเงินที่นับได้')

  return apiClient<ApiCashClose>('/cash-closes', {
    method: 'POST',
    body: JSON.stringify({
      openingFloat: vars.openingFloat,
      countedCash: vars.countedCash,
      note: vars.note?.trim() || undefined,
    }),
  })
}

/** GET /cash-closes?month=YYYY-MM @Roles(ADMIN) */
export async function getCashCloses(month: string): Promise<ApiCashClose[]> {
  return apiClient<ApiCashClose[]>(
    `/cash-closes?month=${encodeURIComponent(month)}`,
  )
}

/** DELETE /cash-closes/:id @Roles(ADMIN) — ลบเพื่อให้แคชเชียร์นับใหม่ */
export async function deleteCashClose(id: Id): Promise<void> {
  await apiClient<void>(`/cash-closes/${id}`, { method: 'DELETE' })
}
