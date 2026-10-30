import { ErrorNote } from '@/components/ui/ErrorNote'
import { button } from '@/components/ui/styles'
import { pageRoles } from '@/features/auth/permissions'
import { useAuth } from '@/features/auth/use-auth'
import {
  useRecheckSlip,
  useSlipIssuePayments,
} from '@/features/payments/hooks'
import { formatBaht } from '@/lib/format'
import { SlipStatus } from '@/types/enums'
import type { Payment } from '@/types/models'
import { useLayoutEffect, useRef, useState } from 'react'
import { AttachSlipDialog } from './AttachSlipDialog'
import { ConfirmSlipDialog } from './ConfirmSlipDialog'
import { needsSlip } from './slip-input'
import { SlipBadge } from './SlipBadge'

const paidAt = (iso: string) =>
  new Date(iso).toLocaleString('th-TH', { dateStyle: 'short', timeStyle: 'short' })

/** แถบข้างแคบ — เห็นทีละเท่านี้ ที่เหลือเลื่อนในกล่อง */
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
  // ยืนยันเองได้ทั้งเจ้าของและหน้าร้าน (ต้องใส่เหตุผล เก็บใน audit log)
  const canConfirm = useAuth((s) => Boolean(s.user && pageRoles.confirmSlip.includes(s.user.role)))
  const [confirming, setConfirming] = useState<Payment | null>(null)
  const [attaching, setAttaching] = useState<Payment | null>(null)
  const listRef = useRef<HTMLUListElement>(null)
  const [listMaxHeight, setListMaxHeight] = useState<number>()
  const scrolls = (payments?.length ?? 0) > VISIBLE_ROWS

  // สูงแต่ละแถวไม่เท่ากัน (มี/ไม่มีปุ่ม, ข้อความยาว) — วัดขอบล่างของแถวที่ 2 จริง แทนการเดาความสูง
  useLayoutEffect(() => {
    // ul เป็น relative ตอนเลื่อนได้ — offsetTop ของแถวจึงนับจากขอบบนของ ul
    const measure = () => {
      const last = listRef.current?.children[VISIBLE_ROWS - 1] as HTMLElement | undefined
      setListMaxHeight(scrolls && last ? last.offsetTop + last.offsetHeight : undefined)
    }
    measure()
    // หมุนจอ/ย่อหน้าต่าง = ข้อความตัดบรรทัดใหม่ แถวสูงเปลี่ยน
    window.addEventListener('resize', measure)
    return () => window.removeEventListener('resize', measure)
  }, [scrolls, payments, canConfirm])

  if (!payments?.length) return null

  return (
    <section className="rounded-xl border-2 border-amber-300 bg-amber-50/50 p-4">
      <h2 className="text-lg font-bold text-black">สลิป PromptPay ที่ต้องตาม ({payments.length})</h2>
      {/* คำอธิบายยาว ซ่อนไว้แบบ "ตัวเลขเหล่านี้คืออะไร" ของลิ้นชัก — การ์ดจะได้ไม่สูงเกินการ์ดโต๊ะ */}
      <details className="text-sm">
        <summary className="inline-flex min-h-11 cursor-pointer list-none items-center gap-1.5 font-semibold text-brand-500">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden className="h-4 w-4">
            <circle cx="12" cy="12" r="9" />
            <path d="M9.5 9.5a2.5 2.5 0 1 1 3.3 2.4c-.5.2-.8.7-.8 1.2V14M12 17h.01" strokeLinecap="round" />
          </svg>
          ต้องทำอะไรกับรายการนี้
        </summary>
        <p className="pb-2 text-gray-700">
          ยังยืนยันไม่ได้ว่าเงินเข้าบัญชีร้านจริง — "รอสลิป" กดตรวจสลิปเมื่อลูกค้ายื่นสลิป ·
          "รอตรวจ" ระบบตรวจซ้ำให้เอง ·
          "ไม่ผ่าน" ให้เช็คแอปธนาคาร แล้ว{canConfirm ? 'ยืนยันเอง' : 'แจ้งเจ้าของร้าน'}หรือยกเลิกบิล
        </p>
      </details>

      <ErrorNote error={recheck.error} />

      {/* เกิน 2 ใบ = เลื่อนในกล่อง · tabIndex ให้เลื่อนด้วยคีย์บอร์ดได้ */}
      <ul
        ref={listRef}
        tabIndex={scrolls ? 0 : undefined}
        aria-label={scrolls ? `รายการสลิป ${payments.length} ใบ เลื่อนดูเพิ่มได้` : undefined}
        style={listMaxHeight ? { maxHeight: listMaxHeight } : undefined}
        className={`divide-y divide-amber-200 ${scrolls ? 'relative overflow-y-auto overscroll-contain' : ''}`}
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
              {needsSlip(p) && (
                <button
                  type="button"
                  onClick={() => setAttaching(p)}
                  className={button('outline', 'sm')}
                >
                  ตรวจสลิป
                </button>
              )}
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
              {canConfirm && (
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

      {scrolls && (
        <p className="border-t border-amber-200 pt-2 text-sm text-gray-600">
          เลื่อนในกล่องเพื่อดูอีก {payments.length - VISIBLE_ROWS} ใบ
        </p>
      )}

      {confirming && (
        <ConfirmSlipDialog payment={confirming} onClose={() => setConfirming(null)} />
      )}
      {attaching && <AttachSlipDialog payment={attaching} onClose={() => setAttaching(null)} />}
    </section>
  )
}
