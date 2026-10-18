import { apiClient } from '@/lib/api-client'
import { mapOrder } from '@/lib/map'
import type { ApiOrder } from '@/types/api'
import type { OrderStatus } from '@/types/enums'
import type { Id, Order } from '@/types/models'

/**
 * GET /orders — ทุก role ที่ login แล้วดูได้
 * เรียงเก่า → ใหม่ ให้ครัวทำตามลำดับที่ลูกค้าสั่งจริง (ใบที่รอนานสุดอยู่บนสุด)
 */
export async function getOrders(): Promise<Order[]> {
  const data = await apiClient<ApiOrder[]>('/orders')
  return data
    .map(mapOrder)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
}

/** PATCH /orders/:id/status @Roles(ADMIN, KITCHEN) — backend คุมลำดับสถานะให้เอง */
export async function updateOrderStatus(vars: {
  id: Id
  status: OrderStatus
}): Promise<Order> {
  const data = await apiClient<ApiOrder>(`/orders/${vars.id}/status`, {
    method: 'PATCH',
    body: JSON.stringify({ status: vars.status }),
  })
  return mapOrder(data)
}

/**
 * PATCH /orders/:id/clear @Roles(ADMIN, KITCHEN)
 * ครัวยกของให้ลูกค้าแล้ว — เอาออกจากบอร์ดถาวร (ออเดอร์ยังอยู่ในบิลรอเก็บเงิน)
 */
export async function clearOrder(id: Id): Promise<Order> {
  const data = await apiClient<ApiOrder>(`/orders/${id}/clear`, {
    method: 'PATCH',
  })
  return mapOrder(data)
}

export interface NewOrderLine {
  menuItemId: Id
  quantity: number
  note: string
  /** ตัวเลือกที่เลือก (เนื้อสัตว์/เพิ่มเติม) — backend คิดราคาตัวเลือกให้เอง */
  optionIds?: Id[]
}

/**
 * POST /orders @Roles(ADMIN, STAFF) — พนักงานรับออเดอร์แทนลูกค้า
 * หมายเหตุ: endpoint นี้รับ tableId ไม่ใช่ tableSessionId
 */
export async function createOrder(vars: {
  tableId: Id
  lines: NewOrderLine[]
}): Promise<Order> {
  const lines = vars.lines.filter((l) => l.quantity > 0)
  if (lines.length === 0) throw new Error('กรุณาเลือกอย่างน้อย 1 รายการ')

  const data = await apiClient<ApiOrder>('/orders', {
    method: 'POST',
    body: JSON.stringify({
      tableId: vars.tableId,
      items: lines.map((l) => ({
        menuItemId: l.menuItemId,
        quantity: l.quantity,
        ...(l.note.trim() ? { note: l.note.trim() } : {}),
        ...(l.optionIds?.length ? { optionIds: l.optionIds } : {}),
      })),
    }),
  })
  return mapOrder(data)
}
