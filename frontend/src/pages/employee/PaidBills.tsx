import { ErrorNote } from '@/components/ui/ErrorNote'
import { LoadError } from '@/components/ui/LoadError'
import { Modal } from '@/components/ui/Modal'
import { Pagination } from '@/components/ui/Pagination'
import { button, field, fieldLabel } from '@/components/ui/styles'
import {
  usePayment,
  useTodayPayments,
  useVoidPayment,
} from '@/features/payments/hooks'
import { formatBaht, formatTime } from '@/lib/format'
import { usePagination } from '@/lib/use-pagination'
import { PaymentMethod, PaymentStatus } from '@/types/enums'
import type { Id, Payment } from '@/types/models'
import { ReceiptDialog } from './ReceiptDialog'
import { SlipBadge } from './SlipBadge'
import { useState } from 'react'

const methodLabel: Record<string, string> = {
  [PaymentMethod.CASH]: 'เงินสด',
  [PaymentMethod.PROMPTPAY]: 'PromptPay',
}

// สีเดียวกับตารางโต๊ะด้านบน: PromptPay/บัตร = ฟ้า, เงินสด = ส้ม
const methodColor: Record<string, string> = {
  [PaymentMethod.CASH]: 'text-black',
  [PaymentMethod.PROMPTPAY]: 'text-black',
}

const isToday = (iso: string) =>
  new Date(iso).toDateString() === new Date().toDateString()

/**
 * บิลที่เก็บเงินไปแล้ววันนี้ — ไว้เปิดดู/พิมพ์ใบเสร็จย้อนหลัง และ "ยกเลิกบิล" ตอนกดจ่ายผิด
 * ยกเลิกแล้ว backend จะคืนออเดอร์เป็นเสิร์ฟแล้วและเปิดโต๊ะกลับ → โต๊ะจะกลับมาโผล่ในตารางด้านบน
 */
export function PaidBills() {
  const { data: payments, isPending, isError, error, refetch } = useTodayPayments()
  const voidPayment = useVoidPayment()

  const [viewId, setViewId] = useState<Id | null>(null)
  const [voidTarget, setVoidTarget] = useState<Payment | null>(null)

  // GET /payments ไม่ส่ง items มา ต้องดึงทีละใบตอนจะเปิดใบเสร็จ
  const { data: viewing } = usePayment(viewId ?? undefined)

  // backend กรองให้แล้ว กรองซ้ำกันไว้เผื่อเปิดจอค้างข้ามเที่ยงคืน
  const today = (payments ?? []).filter((p) => isToday(p.paidAt))
  // วันที่ขายดีจะมีหลายสิบบิล ตัดเป็นหน้า ๆ ไม่งั้นตารางยาวจนหาโต๊ะด้านบนไม่เจอ
  const paged = usePagination(today)

  return (
    <section className="mt-12" aria-labelledby="paid-heading">
      <h2 id="paid-heading" className="mb-3 text-lg font-bold text-black">
        บิลที่เก็บแล้ววันนี้
        {today.length > 0 && (
          <span className="ml-2 text-base font-normal text-gray-600">{today.length} บิล</span>
        )}
      </h2>

      {isError && (
        <LoadError
          what="บิลวันนี้"
          stale={Boolean(payments)}
          error={error}
          onRetry={() => refetch()}
        />
      )}
      <ErrorNote error={voidPayment.error} />

      <div className="overflow-x-auto rounded-xl border-2 border-gray-200">
        <table className="w-full min-w-[640px] border-collapse text-left">
          <thead>
            <tr className="border-b-2 border-gray-300 bg-gray-100 text-black">
              <th className="px-4 py-3 text-sm font-bold sm:text-base">เวลา</th>
              <th className="px-4 py-3 text-sm font-bold sm:text-base">โต๊ะ</th>
              <th className="px-4 py-3 text-sm font-bold sm:text-base">เลขที่ใบเสร็จ</th>
              <th className="px-4 py-3 text-sm font-bold sm:text-base">วิธีจ่าย</th>
              <th className="px-4 py-3 text-right text-sm font-bold sm:text-base">ยอด</th>
              <th className="px-4 py-3 text-right text-sm font-bold sm:text-base">จัดการ</th>
            </tr>
          </thead>

          <tbody className="divide-y divide-gray-200 bg-white">
            {isPending && (
              <tr>
                <td colSpan={6} className="py-6 text-center text-sm text-gray-600">
                  กำลังโหลด...
                </td>
              </tr>
            )}

            {!isPending && !(isError && !payments) && today.length === 0 && (
              <tr>
                <td colSpan={6} className="py-8 text-center text-sm text-gray-600">
                  ยังไม่มีบิลวันนี้
                </td>
              </tr>
            )}

            {paged.pageItems.map((p) => {
              const voided = p.status === PaymentStatus.VOIDED
              return (
                <tr
                  key={p.id}
                  className={`transition ${
                    voided ? 'bg-gray-50 text-gray-600' : 'text-black hover:bg-brand-50/60'
                  }`}
                >
                  <td className="px-4 py-3 tabular-nums">{formatTime(p.paidAt)}</td>
                  <td
                    className={`px-4 py-3 font-bold ${voided ? '' : 'text-black'}`}
                  >
                    {p.tableName}
                  </td>
                  <td className="px-4 py-3 tabular-nums">
                    {p.receipt?.number ?? '-'}
                    {/* หมายเหตุตอนรับเงิน เก็บใน DB แล้ว เปิดดูย้อนหลังได้ */}
                    {p.note && (
                      <span
                        className="block max-w-48 truncate text-sm font-normal text-gray-600"
                        title={p.note}
                      >
                        {p.note}
                      </span>
                    )}
                  </td>
                  <td
                    className={`px-4 py-3 font-semibold ${
                      voided ? '' : methodColor[p.method]
                    }`}
                  >
                    {methodLabel[p.method]}
                    {/* PromptPay: ผลตรวจสลิป (บิลเก่าก่อนมีระบบตรวจไม่มีป้าย) */}
                    {p.slip && !voided && (
                      <span className="mt-1 block">
                        <SlipBadge slip={p.slip} />
                      </span>
                    )}
                  </td>
                  <td
                    className={`px-4 py-3 text-right font-bold tabular-nums ${
                      voided ? 'line-through' : 'text-black'
                    }`}
                  >
                    {formatBaht(p.amount)}
                  </td>
                  <td className="px-4 py-3">
                    {voided ? (
                      <span
                        className="block text-right text-sm font-semibold text-danger-ink"
                        title={p.voidReason ?? undefined}
                      >
                        ยกเลิกแล้ว
                        {p.voidReason && (
                          <span className="block text-sm font-normal text-gray-600">
                            {p.voidReason}
                          </span>
                        )}
                      </span>
                    ) : (
                      // ปุ่มหน้าตาเหมือนลิงก์ แต่พื้นที่กดสูง 40px — บน iPad ข้อความ 20px นิ้วกดพลาดไปโดนอีกปุ่มง่าย
                      <div className="flex items-center justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => setViewId(p.id)}
                          className={button('outline', 'sm')}
                        >
                          ใบเสร็จ
                        </button>
                        <button
                          type="button"
                          onClick={() => setVoidTarget(p)}
                          className={button('danger-outline', 'sm')}
                        >
                          ยกเลิกบิล
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <Pagination
        page={paged.page}
        totalPages={paged.totalPages}
        from={paged.from}
        to={paged.to}
        total={paged.total}
        onChange={paged.setPage}
        unit="บิล"
      />

      {viewing && viewing.id === viewId && (
        <ReceiptDialog payment={viewing} onClose={() => setViewId(null)} />
      )}

      {voidTarget && (
        <VoidDialog
          payment={voidTarget}
          isSaving={voidPayment.isPending}
          error={voidPayment.error}
          onCancel={() => {
            voidPayment.reset()
            setVoidTarget(null)
          }}
          onConfirm={(reason) =>
            voidPayment.mutate(
              { id: voidTarget.id, reason },
              { onSuccess: () => setVoidTarget(null) },
            )
          }
        />
      )}
    </section>
  )
}

function VoidDialog({
  payment,
  isSaving,
  error,
  onCancel,
  onConfirm,
}: {
  payment: Payment
  isSaving: boolean
  /** error ต้องโชว์ในกล่องนี้ — ErrorNote ของหน้าอยู่หลัง modal มองไม่เห็น */
  error: unknown
  onCancel: () => void
  onConfirm: (reason: string) => void
}) {
  const [reason, setReason] = useState('')

  return (
    <Modal title="ยกเลิกบิล" onClose={onCancel}>
      <ErrorNote error={error} />
      <form
        onSubmit={(e) => {
          e.preventDefault()
          onConfirm(reason.trim())
        }}
      >
        <div className="rounded-lg bg-brand-50 px-4 py-3 text-sm text-gray-700">
          <p>
            โต๊ะ <b className="text-black">{payment.tableName}</b> ·{' '}
            {payment.receipt?.number ?? '-'} · {methodLabel[payment.method]}
          </p>
          <p className="mt-1 text-lg font-bold text-black">
            {formatBaht(payment.amount)}
          </p>
        </div>

        <p className="mt-3 text-sm text-gray-600">
          ออเดอร์ในบิลนี้จะกลับไปเป็น "เสิร์ฟแล้ว" และโต๊ะจะเปิดกลับมาให้เก็บเงินใหม่
          ใบเสร็จเดิมใช้ไม่ได้อีก
        </p>

        <label className="mt-4 block">
          <span className={fieldLabel}>
            เหตุผล<span className="ml-1 text-danger-ink">*</span>
          </span>
          <textarea
            value={reason}
            required
            maxLength={200}
            onChange={(e) => setReason(e.target.value)}
            rows={2}
            placeholder="เช่น กดจ่ายผิดโต๊ะ / ลูกค้าเปลี่ยนวิธีจ่าย"
            className={`${field} resize-none`}
          />
        </label>

        <div className="mt-5 grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={onCancel}
            className={button('secondary', 'lg')}
          >
            กลับ
          </button>
          <button
            type="submit"
            // ต้องมีเหตุผลทุกครั้ง — backend ก็บังคับไว้ (เจ้าของต้องไล่ดูย้อนหลังได้)
            disabled={isSaving || !reason.trim()}
            className={button('danger', 'lg')}
          >
            {isSaving ? 'กำลังยกเลิก...' : 'ยืนยันยกเลิกบิล'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
