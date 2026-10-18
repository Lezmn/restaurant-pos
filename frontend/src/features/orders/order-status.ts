import type { BadgeTone } from '@/components/ui/Badge'
import { OrderStatus } from '@/types/enums'

export const statusTone: Record<string, BadgeTone> = {
  [OrderStatus.PENDING]: 'amber',
  [OrderStatus.PREPARING]: 'blue',
  [OrderStatus.SERVED]: 'green',
  [OrderStatus.PAID]: 'gray',
  [OrderStatus.CANCELLED]: 'red',
}

export const statusLabel: Record<string, string> = {
  [OrderStatus.PENDING]: 'รอรับออเดอร์',
  [OrderStatus.PREPARING]: 'กำลังทำ',
  [OrderStatus.SERVED]: 'เสิร์ฟแล้ว',
  [OrderStatus.PAID]: 'ชำระแล้ว',
  [OrderStatus.CANCELLED]: 'ยกเลิก',
}
