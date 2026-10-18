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
import { useState } from 'react'
import { SlipBadge } from './SlipBadge'

const paidAt = (iso: string) =>
  new Date(iso).toLocaleString('th-TH', { dateStyle: 'medium', timeStyle: 'short' })

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

  if (!payments?.length) return null

  return (
    <section className="rounded-xl border-2 border-amber-300 bg-amber-50/50 p-4">
      <h2 className="text-lg font-bold text-black">สลิป PromptPay ที่ต้องตาม ({payments.length})</h2>
      <p className="mt-1 text-sm text-gray-600">
        ยังยืนยันไม่ได้ว่าเงินเข้าบัญชีร้านจริง — "รอตรวจ" ระบบตรวจซ้ำให้เอง ·
        "ไม่ผ่าน" ให้เช็คแอปธนาคาร แล้ว{isAdmin ? 'ยืนยันเอง' : 'แจ้งเจ้าของร้าน'}หรือยกเลิกบิล
      </p>

      <ErrorNote error={recheck.error} />

      <ul className="mt-3 divide-y divide-amber-200">
        {payments.map((p) => (
          <li key={p.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
            <div className="min-w-0">
              <p className="font-semibold text-black">
                โต๊ะ {p.tableName} · {formatBaht(p.amount)}{' '}
                <span className="text-sm font-normal text-gray-500">
                  {p.receipt?.number ?? ''} · {paidAt(p.paidAt)}
                </span>
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
            โต๊ะ {payment.tableName} · {formatBaht(payment.amount)}
          </p>
          <p className="mt-1 text-gray-600">{payment.slip?.message}</p>
        </div>
        <p className="mt-3 text-sm text-gray-600">
          ยืนยันเมื่อเห็นยอดเข้าในแอปธนาคารของร้านแล้วเท่านั้น — ถ้าเงินไม่เข้า ให้ยกเลิกบิลแทน
        </p>
        <label className="mt-3 block">
          <span className={fieldLabel}>
            เหตุผล<span className="ml-1 text-danger-ink">*</span>
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
