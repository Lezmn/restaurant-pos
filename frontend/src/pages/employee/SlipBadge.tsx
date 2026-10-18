import { Badge, type BadgeTone } from '@/components/ui/Badge'
import { SlipStatus } from '@/types/enums'
import type { PaymentSlip } from '@/types/models'

const label: Record<SlipStatus, string> = {
  [SlipStatus.VERIFIED]: '✓ ตรวจสลิปแล้ว',
  [SlipStatus.PENDING]: '⏳ รอตรวจสลิป',
  [SlipStatus.FAILED]: '✗ สลิปไม่ผ่าน',
  [SlipStatus.MANUAL]: '✋ ยืนยันเอง',
}

const tone: Record<SlipStatus, BadgeTone> = {
  [SlipStatus.VERIFIED]: 'green',
  [SlipStatus.PENDING]: 'amber',
  [SlipStatus.FAILED]: 'red',
  [SlipStatus.MANUAL]: 'blue',
}

/** ป้ายผลตรวจสลิป PromptPay — ชี้เมาส์ดูเหตุผลล่าสุด / ใครยืนยันเอง */
export function SlipBadge({ slip }: Readonly<{ slip: PaymentSlip }>) {
  const title =
    slip.status === SlipStatus.MANUAL
      ? `${slip.overrideByName ?? ''}: ${slip.overrideReason ?? ''}`
      : (slip.message ?? undefined)
  return (
    <span title={title}>
      <Badge tone={tone[slip.status]}>{label[slip.status]}</Badge>
    </span>
  )
}
