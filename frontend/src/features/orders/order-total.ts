import type { Order, OrderItem } from '@/types/models'

/**
 * ยอดรวมของออเดอร์ — ใช้แสดงผลเท่านั้น
 * ยอดที่คิดเงินจริงมาจาก backend (field total ของ table-session และ Receipt)
 */
export const itemTotal = (item: OrderItem) =>
  (item.unitPrice + item.optionsTotal) * item.quantity

export const orderTotal = (order: Order) =>
  order.items.reduce((sum, item) => sum + itemTotal(item), 0)
