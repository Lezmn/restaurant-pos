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

/** รายการราคาเปิด — พนักงานพิมพ์ชื่อ/ราคาเอง (backend เก็บประวัติทุกครั้ง) */
export interface CustomOrderLine {
  name: string
  price: number
  quantity: number
  note: string
}

const toCustomPayload = (lines: CustomOrderLine[] = []) =>
  lines
    .filter((l) => l.quantity > 0 && l.name.trim())
    .map((l) => ({
      name: l.name.trim(),
      price: l.price,
      quantity: l.quantity,
      ...(l.note.trim() ? { note: l.note.trim() } : {}),
    }))

export interface NewOrderLine {
  menuItemId: Id
  quantity: number
  note: string
  /** ตัวเลือกที่เลือก (เนื้อสัตว์/เพิ่มเติม) — backend คิดราคาตัวเลือกให้เอง */
  optionIds?: Id[]
}

const toItemsPayload = (lines: NewOrderLine[]) =>
  lines.map((l) => ({
    menuItemId: l.menuItemId,
    quantity: l.quantity,
    ...(l.note.trim() ? { note: l.note.trim() } : {}),
    ...(l.optionIds?.length ? { optionIds: l.optionIds } : {}),
  }))

/**
 * POST /orders/takeaway @Roles(ADMIN, STAFF) — หน้า POS สั่งกลับบ้าน
 * backend เปิดบิลกลับบ้านใบใหม่ (ได้เลขคิวของวัน) + ส่งออเดอร์เข้าครัวในครั้งเดียว
 */
export async function createTakeawayOrder(vars: {
  customerName?: string
  lines: NewOrderLine[]
  customLines?: CustomOrderLine[]
}): Promise<Order> {
  const lines = vars.lines.filter((l) => l.quantity > 0)
  const customItems = toCustomPayload(vars.customLines)
  if (lines.length + customItems.length === 0) throw new Error('กรุณาเลือกอย่างน้อย 1 รายการ')

  const name = vars.customerName?.trim()
  const data = await apiClient<ApiOrder>('/orders/takeaway', {
    method: 'POST',
    body: JSON.stringify({
      ...(name ? { customerName: name } : {}),
      items: toItemsPayload(lines),
      ...(customItems.length ? { customItems } : {}),
    }),
  })
  return mapOrder(data)
}

/**
 * POST /orders @Roles(ADMIN, STAFF) — พนักงานรับออเดอร์แทนลูกค้า
 * หมายเหตุ: endpoint นี้รับ tableId เป็นหลัก ส่ง tableSessionId มาด้วยเพื่อให้ backend
 * ปฏิเสธถ้าบิลรอบนั้นปิดไปแล้ว (ไม่งั้นออเดอร์จะไปเข้าบิลรอบใหม่ของโต๊ะ)
 */
export async function createOrder(vars: {
  tableId: Id
  tableSessionId?: Id
  lines: NewOrderLine[]
  customLines?: CustomOrderLine[]
}): Promise<Order> {
  const lines = vars.lines.filter((l) => l.quantity > 0)
  const customItems = toCustomPayload(vars.customLines)
  if (lines.length + customItems.length === 0) throw new Error('กรุณาเลือกอย่างน้อย 1 รายการ')

  const data = await apiClient<ApiOrder>('/orders', {
    method: 'POST',
    body: JSON.stringify({
      tableId: vars.tableId,
      ...(vars.tableSessionId ? { tableSessionId: vars.tableSessionId } : {}),
      items: toItemsPayload(lines),
      ...(customItems.length ? { customItems } : {}),
    }),
  })
  return mapOrder(data)
}
