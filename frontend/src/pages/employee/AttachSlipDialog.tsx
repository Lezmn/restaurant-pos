import { ErrorNote } from '@/components/ui/ErrorNote'
import { Modal } from '@/components/ui/Modal'
import { button } from '@/components/ui/styles'
import { useAttachSlip } from '@/features/payments/hooks'
import { formatBaht } from '@/lib/format'
import { SlipStatus } from '@/types/enums'
import type { Payment } from '@/types/models'
import { useState } from 'react'
import { emptySlipInput, type SlipInput } from './slip-input'
import { SlipScanField } from './SlipScanField'

/**
 * ตรวจสลิปของบิล PromptPay ที่พิมพ์ใบเสร็จ (มี QR) ไปแล้ว — ลูกค้าสแกนจ่ายแล้วยื่นสลิปให้
 * ตรวจกับ SlipOK แบบเดียวกับตอนรับเงิน · ไม่ผ่าน = บิลยังรอสลิป แนบใบใหม่ได้
 * ไม่มีสลิปเลย: ADMIN กด "ยืนยันเอง" ที่กล่องสลิปที่ต้องตาม
 */
export function AttachSlipDialog({
  payment,
  onClose,
}: Readonly<{ payment: Payment; onClose: () => void }>) {
  const attach = useAttachSlip()
  const [slip, setSlip] = useState<SlipInput>(emptySlipInput)
  // SlipOK ตรวจไม่ได้ตอนนี้ (ยังไม่ตั้งค่า/ล่ม/ให้รอ) — บิลเป็น "รอตรวจ" ไม่ใช่ตรวจผ่าน ห้ามปิดเงียบ ๆ ให้แคชเชียร์เข้าใจผิด
  const [pending, setPending] = useState<Payment | null>(null)
  const ready = slip.payload.trim() !== ''

  if (pending) {
    return (
      <Modal title="ยังตรวจสลิปไม่ได้" onClose={onClose}>
        <div role="alert" className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-gray-800">
          <p className="font-semibold">SlipOK ยังตรวจสลิปนี้ไม่ได้ — ยังไม่รู้ว่าเงินเข้าหรือสลิปซ้ำ</p>
          {pending.slip?.message && <p className="mt-1">สาเหตุ: {pending.slip.message}</p>}
          <p className="mt-1">บิลอยู่ในกล่องสลิปที่ต้องตาม ระบบจะตรวจซ้ำเองเรื่อย ๆ — เช็คยอดในแอปธนาคารก่อนให้ลูกค้าไป</p>
        </div>
        <button type="button" onClick={onClose} className={`mt-5 w-full ${button('primary', 'lg')}`}>
          รับทราบ
        </button>
      </Modal>
    )
  }

  return (
    <Modal title="ตรวจสลิป" onClose={onClose}>
      <form
        onSubmit={(e) => {
          e.preventDefault()
          if (!ready) return
          attach.mutate(
            { id: payment.id, slipPayload: slip.payload },
            {
              onSuccess: (updated) =>
                updated.slip?.status === SlipStatus.PENDING ? setPending(updated) : onClose(),
            },
          )
        }}
      >
        <div className="flex items-baseline justify-between rounded-lg bg-brand-50 px-4 py-3">
          <span className="text-sm font-semibold text-gray-700">
            {payment.placeLabel}
            {payment.receipt?.number && (
              <span className="block font-normal text-gray-600">{payment.receipt.number}</span>
            )}
          </span>
          <span className="text-2xl font-bold text-black tabular-nums">{formatBaht(payment.amount)}</span>
        </div>
        {payment.slip?.status === SlipStatus.FAILED && payment.slip.message && (
          <p className="mt-3 text-sm text-danger-ink">สลิปเดิมไม่ผ่าน: {payment.slip.message}</p>
        )}

        <div className="mt-4">
          <SlipScanField value={slip} onChange={setSlip} canOverride={false} />
        </div>

        <div className="mt-4">
          <ErrorNote error={attach.error} />
        </div>

        <div className="mt-5 grid grid-cols-2 gap-3">
          <button type="button" onClick={onClose} className={button('secondary', 'lg')}>
            กลับ
          </button>
          <button
            type="submit"
            disabled={attach.isPending || !ready}
            className={button('primary', 'lg')}
          >
            {attach.isPending ? 'กำลังตรวจ...' : 'ตรวจสลิป'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
