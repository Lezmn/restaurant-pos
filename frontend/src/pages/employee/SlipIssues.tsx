import { ErrorNote } from '@/components/ui/ErrorNote'
import { Modal } from '@/components/ui/Modal'
import { button, field, fieldLabel } from '@/components/ui/styles'
import { useAuth } from '@/features/auth/use-auth'
import {
  useConfirmSlip,
  useRecheckSlip,
  useSlipIssuePayments,
} from '@/features/payments/hooks'
import { formatBaht } from '@/lib/format'
import { Role, SlipStatus } from '@/types/enums'
import type { Payment } from '@/types/models'
import { useLayoutEffect, useRef, useState, type CSSProperties } from 'react'
import { SlipBadge } from './SlipBadge'
import { RequiredMark } from '@/components/ui/RequiredMark'

const paidAt = (iso: string) =>
  new Date(iso).toLocaleString('th-TH', { dateStyle: 'short', timeStyle: 'short' })

/** จอเล็ก (แถบข้างไม่ได้จำกัดสูง) — เห็นทีละเท่านี้ ที่เหลือเลื่อนในกล่อง · จอ lg ใช้พื้นที่ที่เหลือของแถบข้างแทน */
const VISIBLE_ROWS = 2

/**
 * บิล PromptPay ที่ยังยืนยันไม่ได้ว่าเงินเข้าจริง (ทุกวัน ไม่ใช่แค่วันนี้)
 * - รอตรวจ: ตอนรับเงิน SlipOK/ธนาคารขัดข้อง — ระบบตรวจซ้ำเองทุก 2 นาที กดตรวจเองได้
 * - ไม่ผ่าน: ตรวจซ้ำแล้วไม่ผ่าน/หมดเวลา — เจ้าของต้องเช็คแอปธนาคาร แล้วยืนยันเอง หรือยกเลิกบิล
 * ซ่อนตัวเองถ้าไม่มีอะไรค้าง
 */
export function SlipIssues() {
  const { data: payments } = useSlipIssuePayments()
  const recheck = useRecheckSlip()
  const isAdmin = useAuth((s) => s.user?.role === Role.ADMIN)
  const [confirming, setConfirming] = useState<Payment | null>(null)
  const listRef = useRef<HTMLUListElement>(null)
  const [listMaxHeight, setListMaxHeight] = useState<number>()
  /** มีแถวที่มองไม่เห็นจริง ๆ — วัดจากกล่อง ไม่ได้นับจำนวนใบ (จอ lg ความสูงขึ้นกับที่ว่างในแถบข้าง) */
  const [overflowing, setOverflowing] = useState(false)
  const scrolls = (payments?.length ?? 0) > VISIBLE_ROWS

  // สูงแต่ละแถวไม่เท่ากัน (มี/ไม่มีปุ่ม, ข้อความยาว) — วัดขอบล่างของแถวที่ 2 จริง แทนการเดาความสูง
  useLayoutEffect(() => {
    // ul เป็น relative ตอนเลื่อนได้ — offsetTop ของแถวจึงนับจากขอบบนของ ul
    const list = listRef.current
    const measure = () => {
      const last = list?.children[VISIBLE_ROWS - 1] as HTMLElement | undefined
      setListMaxHeight(scrolls && last ? last.offsetTop + last.offsetHeight : undefined)
      setOverflowing(Boolean(list && list.scrollHeight > list.clientHeight + 1))
    }
    measure()
    // หมุนจอ/ย่อหน้าต่าง = ข้อความตัดบรรทัดใหม่ แถวสูงเปลี่ยน · แถบข้างยืด/หดตอนเลื่อนหน้า = กล่องสูงเปลี่ยน
    window.addEventListener('resize', measure)
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure)
    if (list) observer?.observe(list)
    return () => {
      window.removeEventListener('resize', measure)
      observer?.disconnect()
    }
  }, [scrolls, payments, isAdmin])

  if (!payments?.length) return null

  return (
    // จอ lg: การ์ดหดได้ในแถบข้างที่จำกัดสูง (min-h-0) แล้วให้รายการรับส่วนที่เหลือ
    <section className="rounded-xl border-2 border-amber-300 bg-amber-50/50 p-4 lg:flex lg:min-h-0 lg:flex-col">
      <h2 className="text-lg font-bold text-black">สลิป PromptPay ที่ต้องตาม ({payments.length})</h2>
      {/* คำอธิบายยาว ซ่อนไว้แบบ "ตัวเลขเหล่านี้คืออะไร" ของลิ้นชัก — การ์ดจะได้ไม่สูงเกินการ์ดโต๊ะ */}
      <details className="text-sm">
        <summary className="inline-flex min-h-10 cursor-pointer list-none items-center gap-1.5 font-semibold text-brand-500">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden className="h-4 w-4">
            <circle cx="12" cy="12" r="9" />
            <path d="M9.5 9.5a2.5 2.5 0 1 1 3.3 2.4c-.5.2-.8.7-.8 1.2V14M12 17h.01" strokeLinecap="round" />
          </svg>
          ต้องทำอะไรกับรายการนี้
        </summary>
        <p className="pb-2 text-gray-700">
          ยังยืนยันไม่ได้ว่าเงินเข้าบัญชีร้านจริง — "รอตรวจ" ระบบตรวจซ้ำให้เอง ·
          "ไม่ผ่าน" ให้เช็คแอปธนาคาร แล้ว{isAdmin ? 'ยืนยันเอง' : 'แจ้งเจ้าของร้าน'}หรือยกเลิกบิล
        </p>
      </details>

      <ErrorNote error={recheck.error} />

      {/* จอเล็ก: เกิน 2 ใบ = เลื่อนในกล่อง · จอ lg: กล่องสูงเท่าที่เหลือในแถบข้าง (max-h ของจอเล็กไม่ใช้)
          แต่ไม่ต่ำกว่า ~1 แถว (min-h-36) — จอเตี้ยมากแถบข้างจะเลื่อนเองแทน
          tabIndex ให้เลื่อนด้วยคีย์บอร์ดได้ */}
      <ul
        ref={listRef}
        tabIndex={scrolls || overflowing ? 0 : undefined}
        aria-label={scrolls || overflowing ? `รายการสลิป ${payments.length} ใบ เลื่อนดูเพิ่มได้` : undefined}
        style={listMaxHeight ? ({ '--rows-h': `${listMaxHeight}px` } as CSSProperties) : undefined}
        className={`relative divide-y divide-amber-200 lg:min-h-36 lg:overflow-y-auto lg:overscroll-contain ${
          scrolls ? 'max-h-(--rows-h) overflow-y-auto overscroll-contain lg:max-h-none' : ''
        }`}
      >
        {payments.map((p) => (
          <li key={p.id} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 py-2.5">
            <div className="min-w-0">
              <p className="font-semibold text-black">
                {p.placeLabel} · {formatBaht(p.amount)}
              </p>
              <p className="truncate text-sm text-gray-500">
                {p.receipt?.number ? `${p.receipt.number} · ` : ''}
                {paidAt(p.paidAt)}
              </p>
              <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-gray-600">
                {p.slip && <SlipBadge slip={p.slip} />}
                <span>{p.slip?.message}</span>
              </div>
            </div>

            <div className="flex shrink-0 gap-2">
              {p.slip?.status === SlipStatus.PENDING && (
                <button
                  type="button"
                  disabled={recheck.isPending}
                  onClick={() => recheck.mutate(p.id)}
                  className={button('outline', 'sm')}
                >
                  {recheck.isPending && recheck.variables === p.id ? 'กำลังตรวจ...' : 'ตรวจอีกครั้ง'}
                </button>
              )}
              {isAdmin && (
                <button
                  type="button"
                  onClick={() => setConfirming(p)}
                  className={button('primary', 'sm')}
                >
                  ยืนยันเอง
                </button>
              )}
            </div>
          </li>
        ))}
      </ul>

      {overflowing && (
        <p className="shrink-0 border-t border-amber-200 pt-2 text-sm text-gray-600">
          เลื่อนในกล่องเพื่อดูสลิปที่เหลือ
        </p>
      )}

      {confirming && (
        <ConfirmSlipDialog payment={confirming} onClose={() => setConfirming(null)} />
      )}
    </section>
  )
}

/** ADMIN ยืนยันว่าเงินเข้าแล้ว (เช็คในแอปธนาคารเอง) — ต้องมีเหตุผล เก็บไว้ตรวจย้อนหลัง */
function ConfirmSlipDialog({
  payment,
  onClose,
}: Readonly<{ payment: Payment; onClose: () => void }>) {
  const confirm = useConfirmSlip()
  const [reason, setReason] = useState('')

  return (
    <Modal title="ยืนยันรับเงินเอง" onClose={onClose}>
      <ErrorNote error={confirm.error} />
      <form
        onSubmit={(e) => {
          e.preventDefault()
          if (!reason.trim()) return
          confirm.mutate({ id: payment.id, reason }, { onSuccess: onClose })
        }}
      >
        <div className="rounded-lg bg-brand-50 px-4 py-3 text-sm text-gray-700">
          <p className="font-bold text-black">
            {payment.placeLabel} · {formatBaht(payment.amount)}
          </p>
          <p className="mt-1 text-gray-600">{payment.slip?.message}</p>
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
            placeholder="เช่น เช็คแอปธนาคารแล้ว ยอดเข้า 19:42"
            className={`${field} resize-none`}
          />
        </label>
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
