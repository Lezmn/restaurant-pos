import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { ErrorNote } from '@/components/ui/ErrorNote'
import { Modal } from '@/components/ui/Modal'
import { useOrders } from '@/features/orders/hooks'
import { useAuth } from '@/features/auth/use-auth'
import { useCreatePayment } from '@/features/payments/hooks'
import { useServiceRequests } from '@/features/service-requests/hooks'
import { useCloseSession, useSessions } from '@/features/table-sessions/hooks'
import { IS_DEMO_PROMPTPAY, PROMPTPAY_ID } from '@/lib/config'
import { formatBaht } from '@/lib/format'
import { LIVE_POLL_MS } from '@/lib/live'
import { buildPromptPayPayload } from '@/lib/promptpay'
import {
  OrderStatus,
  PaymentMethod,
  Role,
  ServiceRequestStatus,
  ServiceRequestType,
  TableSessionStatus,
} from '@/types/enums'
import type { Id, Payment, TableSession } from '@/types/models'
import { CashDrawerBar } from './CashDrawerBar'
import { PaidBills } from './PaidBills'
import { ReceiptDialog } from './ReceiptDialog'
import { SlipIssues } from './SlipIssues'
import {
  emptySlipInput,
  isSlipReady,
  SlipScanField,
  type SlipInput,
} from './SlipScanField'
import { QRCodeSVG } from 'qrcode.react'
import { useMemo, useState } from 'react'

const POLL_MS = LIVE_POLL_MS

const methodLabel: Record<string, string> = {
  [PaymentMethod.CASH]: 'เงินสด',
  [PaymentMethod.PROMPTPAY]: 'PromptPay',
}

// PromptPay = ฟ้า, เงินสด = ส้ม (บัตรใช้ฟ้าเหมือน PromptPay เพราะเป็นการจ่ายผ่านระบบ)
const methodColor: Record<string, string> = {
  [PaymentMethod.CASH]: 'text-brand-300',
  [PaymentMethod.PROMPTPAY]: 'text-promptpay',
}

// สถานะที่กดได้ ต้องบอกให้รู้ว่ากดได้ — เข้มขึ้น + ขีดเส้นใต้ตอนชี้เมาส์
const methodHover: Record<string, string> = {
  [PaymentMethod.CASH]: 'hover:text-brand-400',
  [PaymentMethod.PROMPTPAY]: 'hover:brightness-75',
}

const dialogTitle: Record<string, string> = {
  [PaymentMethod.CASH]: 'ชำระเงินสด',
  [PaymentMethod.PROMPTPAY]: 'ชำระผ่าน PromptPay',
}

interface PayTarget {
  sessionId: Id
  tableName: string
  method: PaymentMethod
  amountDue: number
  /** ลูกค้ากดเช็คบิลมาเองพร้อมเลือกวิธีจ่ายแล้วหรือยัง */
  chosenByCustomer: boolean
}

export function CheckPage() {
  const { data: requests } = useServiceRequests({ refetchInterval: POLL_MS })
  const { data: sessions, isPending } = useSessions({
    refetchInterval: POLL_MS,
  })
  const { data: orders } = useOrders({ refetchInterval: POLL_MS })
  const createPayment = useCreatePayment()
  const isAdmin = useAuth((s) => s.user?.role === Role.ADMIN)
  const closeSession = useCloseSession()
  const [target, setTarget] = useState<PayTarget | null>(null)
  /** ใบเสร็จที่เพิ่งออก — เปิดให้พิมพ์ทันทีหลังรับเงิน */
  const [receipt, setReceipt] = useState<Payment | null>(null)
  /** โต๊ะที่กำลังจะปิด — ยืนยันใน popup แบบเดียวกับหน้าอื่น (เดิมใช้ confirm() ของเบราว์เซอร์) */
  const [closing, setClosing] = useState<{
    session: TableSession
    neverOrdered: boolean
  } | null>(null)

  const openSessions = (sessions ?? []).filter(
    (s) => s.status === TableSessionStatus.OPEN,
  )

  const rows = openSessions.map((session) => {
    const checkout = requests?.find(
      (r) =>
        r.tableSessionId === session.id &&
        r.type === ServiceRequestType.CHECKOUT &&
        r.status === ServiceRequestStatus.PENDING,
    )

    // ยอดค้างจ่ายมาจาก backend (total ของ session = ออเดอร์ที่ยังไม่จ่ายและไม่ยกเลิก)
    // ไม่บวกเองฝั่งนี้ เพื่อให้ตรงกับยอดที่ backend เก็บจริงเสมอ
    const outstanding = session.total

    // ออเดอร์ใช้แค่เช็คว่ายังมีอะไรค้างเสิร์ฟไหม — backend ไม่ยอมให้จ่ายถ้ายังไม่เสิร์ฟครบ
    // บอกไว้ก่อนกด จะได้ไม่เจอ error
    const unpaid = (orders ?? []).filter(
      (o) =>
        o.tableSessionId === session.id &&
        o.status !== OrderStatus.PAID &&
        o.status !== OrderStatus.CANCELLED,
    )
    const notServed = unpaid.filter((o) => o.status !== OrderStatus.SERVED)

    // ครัวยกเลิกไป = ยอดหายไปจากบิล บอกไว้ด้วยจะได้ไม่งงว่าทำไมยอดไม่ตรงที่ลูกค้าสั่ง
    const cancelled = (orders ?? []).filter(
      (o) =>
        o.tableSessionId === session.id &&
        o.status === OrderStatus.CANCELLED,
    )

    // เปิดโต๊ะไว้แต่ยังไม่มีออเดอร์เลย (หรือโดนยกเลิกหมด) — คนละเรื่องกับจ่ายครบแล้ว
    const neverOrdered =
      (orders ?? []).filter((o) => o.tableSessionId === session.id).length ===
      cancelled.length

    return {
      session,
      outstanding,
      unpaid,
      notServed,
      cancelled,
      neverOrdered,
      checkout,
    }
  })

  return (
    <div>
      <CashDrawerBar />

      <ErrorNote error={createPayment.error} />

      {isPending && <p className="text-sm text-gray-500">กำลังโหลด...</p>}

      <div className="overflow-x-auto rounded-lg border border-gray-200">
        <table className="w-full min-w-[600px] border-collapse text-center">
          <thead>
            <tr className="bg-table-head text-white">
              <th className="px-4 py-3 text-base font-bold sm:text-lg">โต๊ะ</th>
              <th className="px-4 py-3 text-base font-bold sm:text-lg">
                ราคาที่ต้องจ่าย
              </th>
              <th className="px-4 py-3 text-base font-bold sm:text-lg">
                รูปแบบการจ่าย
              </th>
              <th className="px-4 py-3 text-base font-bold sm:text-lg">
                Status
              </th>
            </tr>
          </thead>

          <tbody className="divide-y divide-gray-200 bg-white">
            {rows.length === 0 && (
              <tr>
                <td colSpan={4} className="py-10 text-sm text-gray-400">
                  ยังไม่มีโต๊ะที่เปิดอยู่
                </td>
              </tr>
            )}

            {rows.map(
              ({
                session,
                outstanding,
                unpaid,
                notServed,
                cancelled,
                neverOrdered,
                checkout,
              }) => {
                // ถ้าลูกค้ายังไม่ได้กดเช็คบิล พนักงานก็เปิดบิลเองได้ ตั้งต้นเป็นเงินสด
                // คำขอเก่าอาจเป็น CARD ที่ร้านเลิกรับแล้ว (backend ไม่รับ) — ถือว่ายังไม่ได้เลือก
                const customerMethod = payMethods.find(
                  (m) => m === checkout?.paymentMethod,
                )
                const method = customerMethod ?? PaymentMethod.CASH
                // ไม่มีอะไรให้เก็บเงินแล้ว (ยกเลิกหมด/เปิดโต๊ะทิ้งไว้) — ต้องปิดโต๊ะได้
                // ไม่งั้นโต๊ะค้าง OCCUPIED ตลอดไป เปิด QR ใหม่ก็ไม่ได้
                const nothingToCharge = unpaid.length === 0

                return (
                  <tr
                    key={session.id}
                    className="transition hover:bg-brand-50/60"
                  >
                    <td className="px-4 py-3 font-bold text-black">
                      {session.tableName}
                    </td>
                    <td className="px-4 py-3 font-bold text-black">
                      {formatBaht(outstanding)}
                      {cancelled.length > 0 && (
                        <span className="block text-xs font-normal text-danger">
                          ยกเลิกไป {cancelled.length} ออเดอร์
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {customerMethod ? (
                        <span
                          className={`font-semibold ${methodColor[customerMethod]}`}
                        >
                          {methodLabel[customerMethod]}
                        </span>
                      ) : (
                        <span className="text-gray-500">ลูกค้ายังไม่ได้เลือก</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {nothingToCharge ? (
                        <button
                          type="button"
                          disabled={closeSession.isPending}
                          onClick={() => setClosing({ session, neverOrdered })}
                          title="ไม่มียอดต้องเก็บ — ปิดโต๊ะเพื่อคืนโต๊ะให้ว่าง"
                          className="min-h-10 cursor-pointer rounded-lg px-3 font-semibold text-gray-600 underline-offset-4 transition hover:text-brand-400 hover:underline disabled:opacity-60"
                        >
                          <span className="block text-xs font-normal text-gray-500">
                            {neverOrdered
                              ? 'ยังไม่ได้สั่งอาหาร'
                              : 'เก็บเงินครบแล้ว'}
                          </span>
                          ปิดโต๊ะ
                        </button>
                      ) : notServed.length > 0 ? (
                        <span
                          className="text-sm text-gray-500"
                          title="ต้องเสิร์ฟให้ครบทุกเมนูก่อนจึงจะเก็บเงินได้"
                        >
                          {`ยังเสิร์ฟไม่ครบ (เหลือ ${notServed.length} ออเดอร์)`}
                        </span>
                      ) : (
                        <button
                          type="button"
                          onClick={() =>
                            setTarget({
                              sessionId: session.id,
                              tableName: session.tableName,
                              method,
                              amountDue: outstanding,
                              chosenByCustomer: Boolean(customerMethod),
                            })
                          }
                          title="บันทึกการชำระเงิน"
                          className={`inline-flex min-h-10 cursor-pointer items-center gap-1.5 rounded-lg px-3 font-semibold underline-offset-4 transition hover:underline focus-visible:ring-2 focus-visible:ring-brand-300 focus-visible:outline-none ${
                            methodColor[method]
                          } ${methodHover[method]}`}
                        >
                          <svg
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            aria-hidden
                            className="h-4 w-4"
                          >
                            <path
                              d="M12 20h7M4 20h3l10-10-3-3L4 17z"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            />
                          </svg>
                          {checkout ? 'รอเช็คบิล' : 'เก็บเงิน'}
                        </button>
                      )}
                    </td>
                  </tr>
                )
              },
            )}
          </tbody>
        </table>
      </div>

      {/* บิล PromptPay ที่ยังยืนยันเงินเข้าไม่ได้ (ทุกวัน) — ซ่อนเองถ้าไม่มี */}
      <SlipIssues />

      <PaidBills />

      {closing && (
        <ConfirmDialog
          title="ปิดโต๊ะ"
          subject={`โต๊ะ ${closing.session.tableName}`}
          detail={
            closing.neverOrdered
              ? 'ยังไม่ได้สั่งอาหาร'
              : 'เก็บเงินครบแล้ว ไม่มียอดค้างชำระ'
          }
          consequence="QR ของโต๊ะนี้จะใช้สั่งอาหารไม่ได้อีก และโต๊ะจะกลับเป็นว่าง"
          confirmLabel="ปิดโต๊ะ"
          pendingLabel="กำลังปิด..."
          tone="brand"
          isPending={closeSession.isPending}
          error={closeSession.error}
          onCancel={() => {
            closeSession.reset()
            setClosing(null)
          }}
          onConfirm={() =>
            closeSession.mutate(closing.session.id, {
              onSuccess: () => setClosing(null),
            })
          }
        />
      )}

      {receipt && (
        <ReceiptDialog payment={receipt} onClose={() => setReceipt(null)} />
      )}

      {target && (
        <PaymentDialog
          target={target}
          isSaving={createPayment.isPending}
          error={createPayment.error}
          onCancel={() => {
            createPayment.reset()
            setTarget(null)
          }}
          canOverrideSlip={isAdmin}
          onSubmit={({ method, note, amount, slip }) =>
            createPayment.mutate(
              {
                tableSessionId: target.sessionId,
                method,
                tableName: target.tableName,
                note,
                // PromptPay: ส่งข้อความ QR ของสลิปให้ backend ตรวจกับ SlipOK
                ...(method === PaymentMethod.PROMPTPAY
                  ? slip.override
                    ? { slipOverrideReason: slip.overrideReason.trim() }
                    : { slipPayload: slip.payload.trim() }
                  : {}),
                // ยอดที่ลูกค้าเห็นบนจอ/QR — ถ้ายอดจริงเปลี่ยนไประหว่างนี้ backend จะไม่ยอมบันทึก
                expectedTotal: target.amountDue,
                // เท่ากับยอดบิลก็ไม่ต้องส่ง ปล่อยให้ backend คิดเองเหมือนเดิม
                amount: amount === target.amountDue ? undefined : amount,
              },
              {
                onSuccess: (payment) => {
                  setTarget(null)
                  setReceipt(payment)
                },
              },
            )
          }
        />
      )}
    </div>
  )
}

const payMethods = [PaymentMethod.CASH, PaymentMethod.PROMPTPAY] as const

function PaymentDialog({
  target,
  isSaving,
  error,
  canOverrideSlip,
  onCancel,
  onSubmit,
}: {
  target: PayTarget
  isSaving: boolean
  /** error ต้องโชว์ในกล่องนี้ — ErrorNote ของหน้าอยู่หลัง modal มองไม่เห็น */
  error: unknown
  /** ADMIN ยืนยันรับเงิน PromptPay เองได้เมื่อไม่มีสลิป */
  canOverrideSlip: boolean
  onCancel: () => void
  onSubmit: (input: {
    method: PaymentMethod
    note: string
    amount: number
    slip: SlipInput
  }) => void
}) {
  /**
   * แยกสองยอดออกจากกัน เดิมมีช่องเดียวเลยทำได้แค่คิดเงินทอน แก้ยอดจริงไม่ได้
   * - charged  = ยอดที่บันทึกเป็นรายได้ (ลดได้ เช่น ลูกค้าต่อรอง/ของมีตำหนิ)
   * - received = เงินที่ลูกค้ายื่นมา ใช้คิดเงินทอนอย่างเดียว ไม่ได้บันทึก
   */
  const [charged, setCharged] = useState(String(target.amountDue))
  const [received, setReceived] = useState('')
  const [note, setNote] = useState('')
  // โต๊ะที่ลูกค้าไม่ได้กดเช็คบิลจาก QR ต้องให้พนักงานเลือกวิธีจ่ายเอง
  const [method, setMethod] = useState<PaymentMethod>(target.method)
  const [slip, setSlip] = useState<SlipInput>(emptySlipInput)

  const isPromptPay = method === PaymentMethod.PROMPTPAY
  const chargedNum = Number(charged)
  const chargedValid =
    charged.trim() !== '' &&
    Number.isFinite(chargedNum) &&
    chargedNum >= 0 &&
    chargedNum <= target.amountDue
  const discount = target.amountDue - chargedNum
  // PromptPay ต้องมีสลิปให้ตรวจ (หรือ ADMIN ยืนยันเอง) — backend ก็บังคับไว้อีกชั้น
  const canSubmit = chargedValid && (!isPromptPay || isSlipReady(slip))
  const change = (Number(received) || 0) - chargedNum

  // QR ผูกยอดเงินไว้ด้วย ลูกค้าจึงไม่ต้องกรอกยอดเอง
  const qrPayload = useMemo(
    () =>
      isPromptPay ? buildPromptPayPayload(PROMPTPAY_ID, chargedNum || 0) : '',
    [isPromptPay, chargedNum],
  )

  return (
    <Modal title={dialogTitle[method]} onClose={onCancel}>
      <ErrorNote error={error} />
      <form
        onSubmit={(e) => {
          e.preventDefault()
          if (!canSubmit) return
          onSubmit({ method, note: note.trim(), amount: chargedNum, slip })
        }}
      >
        <p className="mb-3 text-sm text-gray-500">
          โต๊ะ {target.tableName} · ยอดที่ต้องจ่าย{' '}
          <span className="font-bold text-black">
            {formatBaht(target.amountDue)}
          </span>
        </p>

        {/* เลือกได้เสมอ — ลูกค้าอาจกดเช็คบิลเลือก PromptPay ไว้ แต่มาจ่ายเงินสดจริง
            เดิมซ่อนปุ่มไว้เลยต้องบันทึกผิดวิธี ยอดแยกตามวิธีจ่ายในรายงานก็ผิดตาม */}
        {target.chosenByCustomer && (
          <p className="mb-2 text-xs text-gray-500">
            ลูกค้าเลือก {methodLabel[target.method] ?? target.method} ไว้ — เปลี่ยนได้ถ้าจ่ายจริงต่างจากนี้
          </p>
        )}
        <div className="mb-4 grid grid-cols-2 gap-3">
          {payMethods.map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMethod(m)}
              className={`rounded-lg border-2 py-2.5 text-sm font-bold transition ${
                method === m
                  ? `border-current ${methodColor[m]} bg-brand-50`
                  : 'border-gray-300 text-gray-500 hover:bg-gray-50'
              }`}
            >
              {methodLabel[m]}
            </button>
          ))}
        </div>

        {isPromptPay && (
          <div className="mb-4 flex flex-col items-center rounded-xl border-2 border-promptpay/30 bg-promptpay/5 p-4">
            <p className="mb-2 text-sm font-bold text-promptpay">
              ให้ลูกค้าสแกนเพื่อจ่าย
            </p>
            <div className="rounded-lg bg-white p-3">
              <QRCodeSVG value={qrPayload} size={180} />
            </div>
            <p className="mt-2 text-lg font-bold text-black">
              {formatBaht(chargedNum || 0)}
            </p>

            {IS_DEMO_PROMPTPAY && (
              <p className="mt-2 text-center text-xs text-danger">
                โหมดเดโม — ยังไม่ได้ตั้ง VITE_PROMPTPAY_ID
                สแกนแล้วจะไม่พบบัญชีปลายทาง
              </p>
            )}

          </div>
        )}

        {isPromptPay && (
          <SlipScanField value={slip} onChange={setSlip} canOverride={canOverrideSlip} />
        )}

        <label className="block">
          <span className="flex items-center gap-1.5 text-sm text-gray-700">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              aria-hidden
              className="h-4 w-4 text-brand-400"
            >
              <circle cx="12" cy="12" r="9" />
              <path
                d="M9.5 9.5A2.5 2.5 0 0 1 12 8c1.4 0 2.5.9 2.5 2s-1.1 1.8-2.5 2-2.5.9-2.5 2 1.1 2 2.5 2a2.5 2.5 0 0 0 2.5-1.5"
                strokeLinecap="round"
              />
            </svg>
            ราคาที่เก็บจริง
          </span>
          <input
            type="number"
            min="0"
            max={target.amountDue}
            step="0.01"
            value={charged}
            onChange={(e) => setCharged(e.target.value)}
            className="mt-1 w-full rounded border border-gray-300 bg-gray-100 px-3 py-2 outline-none focus:border-brand-300 focus:bg-white"
          />
        </label>

        {/* ลดให้ลูกค้าได้ แต่เก็บเกินยอดบิลไม่ได้ (backend ก็กันไว้อีกชั้น) */}
        {chargedNum > target.amountDue && (
          <p className="mt-1 text-sm font-semibold text-danger">
            เก็บเกินยอดบิลไม่ได้ — สูงสุด {formatBaht(target.amountDue)}
          </p>
        )}
        {chargedValid && discount > 0 && (
          <p className="mt-1 text-right text-sm font-semibold text-danger">
            ส่วนลด {formatBaht(discount)} (บันทึกลงใบเสร็จ)
          </p>
        )}

        {/* เงินสด: กรอกเงินที่ลูกค้ายื่นมาเพื่อให้ช่วยคิดเงินทอน ไม่ได้บันทึกลงระบบ */}
        {!isPromptPay && (
          <label className="mt-3 block">
            <span className="text-sm text-gray-700">
              รับเงินมา (ไว้คิดเงินทอน)
            </span>
            <input
              type="number"
              min="0"
              step="0.01"
              value={received}
              onChange={(e) => setReceived(e.target.value)}
              placeholder="ไม่กรอกก็ได้"
              className="mt-1 w-full rounded border border-gray-300 bg-gray-100 px-3 py-2 outline-none focus:border-brand-300 focus:bg-white"
            />
            {/* ยังบันทึกได้ (ช่องนี้ไว้คิดเงินทอนเฉย ๆ) แต่ต้องเตือนให้เห็น จะได้ไม่ปล่อยลูกค้าไปทั้งที่เงินขาด */}
            {Number(received) > 0 && change < 0 && (
              <span className="mt-1 block text-right text-sm font-semibold text-danger">
                รับเงินมาไม่พอ ขาดอีก {formatBaht(-change)}
              </span>
            )}
            {change > 0 && (
              <span className="mt-1 block text-right text-sm font-semibold text-brand-400">
                เงินทอน {formatBaht(change)}
              </span>
            )}
          </label>
        )}

        <label className="mt-4 block">
          <span className="flex items-center gap-1.5 text-sm text-gray-700">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              aria-hidden
              className="h-4 w-4 text-brand-400"
            >
              <rect x="3" y="5" width="18" height="14" rx="2" />
              <path d="M7 9h10M7 13h6" strokeLinecap="round" />
            </svg>
            รายละเอียด
          </span>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={3}
            maxLength={500}
            placeholder="พิมพ์ลงบนใบเสร็จ และเก็บไว้ในระบบ"
            className="mt-1 w-full resize-none rounded border border-gray-300 bg-gray-100 px-3 py-2 outline-none focus:border-brand-300 focus:bg-white"
          />
        </label>

        <div className="mt-5 grid grid-cols-2 gap-4">
          <button
            type="button"
            onClick={onCancel}
            className="rounded bg-danger py-2.5 font-bold text-white transition hover:brightness-95"
          >
            ยกเลิก
          </button>
          <button
            type="submit"
            disabled={isSaving || !canSubmit}
            className="rounded bg-plus py-2.5 font-bold text-white transition hover:brightness-95 disabled:opacity-60"
          >
            {isSaving ? 'กำลังบันทึก...' : 'บันทึก'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
