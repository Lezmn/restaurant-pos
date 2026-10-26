import { apiClient } from '@/lib/api-client'

export type CheckState = 'ok' | 'warn' | 'error' | 'off'

/** GET /system/status @Roles(ADMIN) — ตรงกับ SystemStatusService ฝั่ง backend */
export interface SystemStatus {
  checkedAt: string
  uptimeSeconds: number
  database: { state: CheckState; latencyMs: number | null }
  backup: { state: CheckState; lastAt: string | null; lastSizeBytes: number | null; fileCount: number }
  offsite: { state: CheckState; lastAt: string | null }
  slipOk: { state: CheckState; mock: boolean; configured: boolean }
  line: { state: CheckState; configured: boolean }
}

export const getSystemStatus = () => apiClient<SystemStatus>('/system/status')
