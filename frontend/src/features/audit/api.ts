import { apiClient } from '@/lib/api-client'

export type AuditAction =
  | 'PAYMENT_DISCOUNT'
  | 'PAYMENT_SLIP_OVERRIDE'
  | 'PAYMENT_VOID'
  | 'PAYMENT_SLIP_CONFIRM'
  | 'ORDER_CANCEL'
  | 'ORDER_ITEM_REMOVE'
  | 'ORDER_CUSTOM_ITEM'
  | 'SETTINGS_LINE_UPDATE'
  | 'CASH_CLOSE_CREATE'
  | 'CASH_CLOSE_DELETE'
  | 'EXPENSE_DRAWER'
  | 'EXPENSE_CREATE'
  | 'EXPENSE_UPDATE'
  | 'EXPENSE_DELETE'
  | 'MENU_UPDATE'
  | 'MENU_DELETE'
  | 'USER_CREATE'
  | 'USER_UPDATE'
  | 'USER_DELETE'

export interface AuditLog {
  id: string
  action: AuditAction
  targetId: string | null
  details: Record<string, unknown> | null
  userId: string | null
  userName: string
  userRole: string
  deviceName: string | null
  deviceId: string | null
  ip: string | null
  userAgent: string | null
  createdAt: string
}

export interface AuditLogFilter {
  from: Date
  to: Date
  action?: AuditAction
}

/** GET /audit-logs @Roles(ADMIN) — ล่าสุดก่อน ทีละ 100 แถว ส่ง before เพื่อโหลดหน้าถัดไป */
export function getAuditLogs(filter: AuditLogFilter, before?: string) {
  const params = new URLSearchParams({
    from: filter.from.toISOString(),
    to: filter.to.toISOString(),
    limit: '100',
  })
  if (filter.action) params.set('action', filter.action)
  if (before) params.set('before', before)
  return apiClient<{ items: AuditLog[]; hasMore: boolean }>(`/audit-logs?${params}`)
}
