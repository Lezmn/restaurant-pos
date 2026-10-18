import { ErrorNote } from './ErrorNote'
import { Modal } from './Modal'
import type { ReactNode } from 'react'

/**
 * กล่องยืนยันก่อนทำสิ่งที่ย้อนกลับไม่ได้ (ลบเมนู / ยกเลิกออเดอร์ / ปิดโต๊ะ)
 * ใช้แทน confirm() ของเบราว์เซอร์ที่หน้าตาไม่เข้ากับแอปและกดพลาดง่าย
 *
 * ปุ่มยืนยันอยู่ขวาเสมอ และตอนกำลังยิง API จะกดซ้ำไม่ได้
 */
export function ConfirmDialog({
  title,
  /** ชื่อของสิ่งที่กำลังจะทำ — ขึ้นตัวหนาในกรอบให้เห็นชัดว่าเลือกถูกตัวไหม */
  subject,
  /** บรรทัดรองใต้ชื่อ เช่น โต๊ะ/ราคา */
  detail,
  /** ผลที่ตามมา บอกให้รู้ก่อนกด */
  consequence,
  confirmLabel,
  pendingLabel,
  isPending = false,
  /** error จากการยืนยันครั้งก่อน — ต้องโชว์ในกล่องนี้ กล่องอยู่ top layer บังของที่อยู่หลังหมด */
  error,
  tone = 'danger',
  onCancel,
  onConfirm,
}: Readonly<{
  title: string
  subject: string
  detail?: ReactNode
  consequence?: string
  confirmLabel: string
  pendingLabel: string
  isPending?: boolean
  error?: unknown
  tone?: 'danger' | 'brand'
  onCancel: () => void
  onConfirm: () => void
}>) {
  const confirmClass =
    tone === 'danger'
      ? 'bg-danger hover:brightness-95'
      : 'bg-brand-300 hover:bg-brand-400'
  const boxClass = tone === 'danger' ? 'bg-danger/5' : 'bg-brand-50'

  return (
    <Modal title={title} onClose={onCancel}>
      <div className={`rounded-lg px-4 py-3 text-sm text-gray-700 ${boxClass}`}>
        <p className="font-bold text-black">{subject}</p>
        {detail && <p className="mt-1 text-gray-500">{detail}</p>}
      </div>

      {consequence && (
        <p className="mt-3 text-sm text-gray-600">{consequence}</p>
      )}

      <div className="mt-3 empty:mt-0">
        <ErrorNote error={error} />
      </div>

      <div className="mt-5 grid grid-cols-2 gap-3">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-lg border-2 border-gray-300 py-2.5 text-sm font-bold text-gray-700 transition hover:bg-gray-50"
        >
          ย้อนกลับ
        </button>
        <button
          type="button"
          disabled={isPending}
          onClick={onConfirm}
          className={`rounded-lg py-2.5 text-sm font-bold text-white transition disabled:opacity-60 ${confirmClass}`}
        >
          {isPending ? pendingLabel : confirmLabel}
        </button>
      </div>
    </Modal>
  )
}
