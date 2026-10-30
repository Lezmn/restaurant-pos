import { ErrorNote } from '@/components/ui/ErrorNote'
import { Modal } from '@/components/ui/Modal'
import { ReasonChips } from '@/components/ui/ReasonChips'
import { RequiredMark } from '@/components/ui/RequiredMark'
import { button, field, fieldLabel } from '@/components/ui/styles'
import { useConfirmSlip } from '@/features/payments/hooks'
import { formatBaht } from '@/lib/format'
import type { Payment } from '@/types/models'
import { useState } from 'react'

/** เหตุผลที่พบบ่อยตอนยืนยันสลิปเอง — แตะแทนพิมพ์ แล้วพิมพ์เวลา/ยอดเพิ่มได้ */
const CONFIRM_REASONS = [
  'เช็คยอดในแอปธนาคารแล้ว',
  'ระบบตรวจสลิปใช้ไม่ได้',
  'สลิปอ่านไม่ออก แต่ยอดเข้าแล้ว',
] as const

/** ADMIN/STAFF ยืนยันว่าเงินเข้าแล้ว (เช็คในแอปธนาคารเอง) — ต้องมีเหตุผล เก็บไว้ตรวจย้อนหลัง */
export function ConfirmSlipDialog({
  payment,
  onClose,
  onConfirmed = onClose,
}: Readonly<{
  payment: Payment
  /** กด "กลับ" / ปิดกล่อง */
  onClose: () => void
  /** ยืนยันสำเร็จ — ไม่ระบุ = ปิดกล่องเหมือน onClose */
  onConfirmed?: () => void
}>) {
  const confirm = useConfirmSlip()
  const [reason, setReason] = useState('')

  return (
    <Modal title="ยืนยันรับเงินเอง" onClose={onClose}>
      <ErrorNote error={confirm.error} />
      <form
        onSubmit={(e) => {
          e.preventDefault()
          if (!reason.trim()) return
          confirm.mutate({ id: payment.id, reason }, { onSuccess: onConfirmed })
        }}
      >
        <div className="rounded-lg bg-brand-50 px-4 py-3 text-sm text-gray-700">
          <p className="font-bold text-black">
            {payment.placeLabel} · {formatBaht(payment.amount)}
          </p>
          {payment.slip?.message && <p className="mt-1 text-gray-600">{payment.slip.message}</p>}
        </div>
        <p className="mt-3 text-sm text-gray-600">
          ยืนยันเมื่อเห็นยอดเข้าในแอปธนาคารของร้านแล้วเท่านั้น — ถ้าเงินไม่เข้า ให้ยกเลิกบิลแทน
        </p>
        <label className="mt-3 block">
          <span className={fieldLabel}>
            เหตุผล<RequiredMark />
          </span>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={2}
            maxLength={200}
            required
            placeholder="พิมพ์เอง หรือแตะตัวเลือกด้านล่าง เช่น ยอดเข้า 19:42"
            className={`${field} resize-none`}
          />
        </label>
        {/* ปุ่มลัดอยู่นอก <label> — ปุ่มซ้อนใน label ทำให้ชื่อช่องกรอกเพี้ยน */}
        <ReasonChips
          presets={CONFIRM_REASONS}
          value={reason}
          onChange={setReason}
          label="ตัวเลือกที่พบบ่อย"
        />
        <div className="mt-5 grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={onClose}
            className={button('secondary', 'lg')}
          >
            กลับ
          </button>
          <button
            type="submit"
            disabled={confirm.isPending || !reason.trim()}
            className={button('primary', 'lg')}
          >
            {confirm.isPending ? 'กำลังบันทึก...' : 'ยืนยันว่าเงินเข้าแล้ว'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
