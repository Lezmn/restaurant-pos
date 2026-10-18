import { apiClient } from '@/lib/api-client'
import { mapMenuItem, mapOrder } from '@/lib/map'
import type { ApiCategory, ApiOrder, ApiTableSession } from '@/types/api'
import type { PaymentMethod } from '@/types/enums'
import type { MenuItem, Order, TableSession } from '@/types/models'
import type { CartLine } from './cart-store'

/**
 * endpoint ใต้ /public ไม่ต้อง login — ใช้คู่กับ QR ที่โต๊ะ
 * GET  /public/menu · /public/sessions/:token · /public/sessions/:token/orders
 * POST /public/orders · /public/call-staff · /public/checkout
 */

/** /public/menu คืนเป็นหมวดหมู่ที่มีเมนูซ้อนอยู่ข้างใน จึงต้องแบนออกมา */
export async function getPublicMenu(): Promise<MenuItem[]> {
  const data = await apiClient<ApiCategory[]>('/public/menu')
  return data.flatMap((c) =>
    (c.menuItems ?? []).map((m) => mapMenuItem({ ...m, categoryId: c.id })),
  )
}

export async function getPublicCategories() {
  const data = await apiClient<ApiCategory[]>('/public/menu')
  return data.map((c, index) => ({
    id: c.id,
    name: c.name,
    sortOrder: c.sortOrder ?? index,
  }))
}

export async function getSessionByToken(token: string): Promise<TableSession> {
  const data = await apiClient<ApiTableSession>(`/public/sessions/${token}`)
  return {
    id: data.id,
    tableId: data.tableId ?? data.table?.id ?? '',
    tableName: data.table ? String(data.table.number) : '-',
    token: data.token,
    status: data.status,
    openedAt: data.openedAt,
    closedAt: data.closedAt ?? null,
    // /public/sessions ไม่ได้ส่ง total มา ฝั่งลูกค้าใช้ยอดจากรายการออเดอร์แทน
    total: data.total ?? 0,
  }
}

export async function getSessionOrders(token: string): Promise<Order[]> {
  const data = await apiClient<ApiOrder[]>(`/public/sessions/${token}/orders`)
  return data
    .map(mapOrder)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
}

export async function submitOrder(vars: {
  token: string
  lines: CartLine[]
}): Promise<Order> {
  if (vars.lines.length === 0) throw new Error('ยังไม่มีรายการที่เลือก')

  const data = await apiClient<ApiOrder>('/public/orders', {
    method: 'POST',
    body: JSON.stringify({
      sessionToken: vars.token,
      items: vars.lines.map((line) => ({
        menuItemId: line.menuItemId,
        quantity: line.quantity,
        ...(line.note.trim() ? { note: line.note.trim() } : {}),
        ...(line.options.length > 0
          ? { optionIds: line.options.map((o) => o.id) }
          : {}),
      })),
    }),
  })
  return mapOrder(data)
}

export async function callStaff(vars: { token: string }): Promise<void> {
  await apiClient<unknown>('/public/call-staff', {
    method: 'POST',
    body: JSON.stringify({ sessionToken: vars.token }),
  })
}

export async function requestCheckout(vars: {
  token: string
  method: PaymentMethod
}): Promise<void> {
  await apiClient<unknown>('/public/checkout', {
    method: 'POST',
    body: JSON.stringify({
      sessionToken: vars.token,
      paymentMethod: vars.method,
    }),
  })
}
