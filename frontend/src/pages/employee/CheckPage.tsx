import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { ErrorNote } from '@/components/ui/ErrorNote'
import { LoadError } from '@/components/ui/LoadError'
import { Modal } from '@/components/ui/Modal'
import { button, field, fieldLabel } from '@/components/ui/styles'
import { toast } from '@/components/ui/toast'
import { pageRoles } from '@/features/auth/permissions'
import { useOrders } from '@/features/orders/hooks'
import { useAuth } from '@/features/auth/use-auth'
import { useCreatePayment } from '@/features/payments/hooks'
import { useServiceRequests } from '@/features/service-requests/hooks'
import { useCloseSession, useSessions } from '@/features/table-sessions/hooks'
import { IS_DEMO_PROMPTPAY, PROMPTPAY_ID } from '@/lib/config'
import { applyDiscountPercent, isValidDiscountPercent } from '@/lib/discount'
import { splitShare } from '@/lib/split'
import { formatBaht, formatTime } from '@/lib/format'
import { LIVE_POLL_MS } from '@/lib/live'
import { buildPromptPayPayload } from '@/lib/promptpay'
import { useSlashFocus } from '@/lib/use-slash-focus'
import {
  OrderStatus,
  PaymentMethod,
  Role,
  ServiceRequestStatus,
  ServiceRequestType,
  TableSessionStatus,
} from '@/types/enums'
import type { Id, Order, Payment, SessionSplit, TableSession } from '@/types/models'
import { BillScopePicker, type BillScope, type PayLine } from './BillScopePicker'
import { CashDrawerBar } from './CashDrawerBar'
import { PaidBills } from './PaidBills'
import { ReceiptDialog } from './ReceiptDialog'
import { SlipIssues } from './SlipIssues'
import { emptySlipInput, isSlipReady, type SlipInput } from './slip-input'
import { SlipScanField } from './SlipScanField'
import { QRCodeSVG } from 'qrcode.react'
import { useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'

const POLL_MS = LIVE_POLL_MS

const methodLabel: Record<string, string> = {
  [PaymentMethod.CASH]: 'เงินสด',
  [PaymentMethod.PROMPTPAY]: 'PromptPay',
}

const payMethods = [PaymentMethod.CASH, PaymentMethod.PROMPTPAY] as const

interface PayTarget {
  sessionId: Id
  tableName: string
  method: PaymentMethod
  amountDue: number
  /** ลูกค้ากดเช็คบิลมาเองพร้อมเลือกวิธีจ่ายแล้วหรือยัง */
  chosenByCustomer: boolean
  /** รายการที่เสิร์ฟแล้วยังไม่จ่าย — ให้เลือกตอนแยกบิลตามรายการ */
  lines: PayLine[]
  /** โต๊ะนี้หารเท่ากันค้างอยู่ */
  split: SessionSplit | null
}

/**
 * ยอดค้างของโต๊ะ — หารค้างอยู่ = ส่วนที่ยังไม่มีคนจ่ายของบิลที่หาร (หลังส่วนลด)
 * + ออเดอร์ที่สั่งเพิ่มหลังเริ่มหาร (ไม่อยู่ในชุดที่หาร)
 */
const sessionDue = (s: TableSession) =>
  s.split ? Math.round((s.split.remaining + s.total - s.split.subtotal) * 100) / 100 : s.total

/**
 * สถานะของโต๊ะในมุมแคชเชียร์ เรียงตามความเร่งด่วน (เลขน้อยขึ้นก่อน)
 * - checkout: ลูกค้ากดขอเช็คบิลแล้ว และเสิร์ฟครบ — มีคนรออยู่
 * - ready:    เสิร์ฟครบ เก็บเงินได้
 * - serving:  ยังเสิร์ฟไม่ครบ — backend ไม่ยอมให้จ่าย
 * - settled:  ไม่มียอดให้เก็บ (จ่ายครบ/ยกเลิกหมด/ยังไม่สั่ง) — ปิดโต๊ะได้
 */
type TileState = 'checkout' | 'ready' | 'serving' | 'settled'
const stateOrder: Record<TileState, number> = {
  checkout: 0,
  ready: 1,
  serving: 2,
  settled: 3,
}

interface TableRow {
  session: TableSession
  state: TileState
  notServed: Order[]
  cancelled: Order[]
  neverOrdered: boolean
  /** วิธีจ่ายที่ลูกค้าเลือกตอนกดเช็คบิล (ถ้าเป็นวิธีที่ร้านยังรับอยู่) */
  customerMethod: PaymentMethod | undefined
}

export function CheckPage() {
  const requestsQuery = useServiceRequests({ refetchInterval: POLL_MS })
  const sessionsQuery = useSessions({ refetchInterval: POLL_MS })
  const ordersQuery = useOrders({ refetchInterval: POLL_MS })
  const requests = requestsQuery.data
  const sessions = sessionsQuery.data
  const orders = ordersQuery.data

  const createPayment = useCreatePayment()
  const user = useAuth((s) => s.user)
  const isAdmin = user?.role === Role.ADMIN
  const canOpenTable = Boolean(user && pageRoles.openTable.includes(user.role))
  const closeSession = useCloseSession()
  const [search, setSearch] = useState('')
  const searchRef = useRef<HTMLInputElement>(null)
  useSlashFocus(searchRef)
  const [target, setTarget] = useState<PayTarget | null>(null)
  /** ใบเสร็จที่เพิ่งออก — เปิดให้พิมพ์ทันทีหลังรับเงิน */
  const [receipt, setReceipt] = useState<{
    payment: Payment
    tendered: number | null
  } | null>(null)
  /** โต๊ะที่กำลังจะปิด — ยืนยันใน popup แบบเดียวกับหน้าอื่น (เดิมใช้ confirm() ของเบราว์เซอร์) */
  const [closing, setClosing] = useState<{
    session: TableSession
    neverOrdered: boolean
  } | null>(null)

  const rows = useMemo<TableRow[]>(() => {
    const open = (sessions ?? []).filter(
      (s) => s.status === TableSessionStatus.OPEN,
    )

    return open
      .map((session) => {
        const checkout = requests?.find(
          (r) =>
            r.tableSessionId === session.id &&
            r.type === ServiceRequestType.CHECKOUT &&
            r.status === ServiceRequestStatus.PENDING,
        )
        const mine = (orders ?? []).filter((o) => o.tableSessionId === session.id)

        // ออเดอร์ใช้แค่เช็คว่ายังมีอะไรค้างเสิร์ฟไหม — backend ไม่ยอมให้จ่ายถ้ายังไม่เสิร์ฟครบ
        // ส่วนยอดเงินใช้ session.total จาก backend เสมอ ไม่บวกเองฝั่งนี้
        const unpaid = mine.filter(
          (o) =>
            o.status !== OrderStatus.PAID && o.status !== OrderStatus.CANCELLED,
        )
        const notServed = unpaid.filter((o) => o.status !== OrderStatus.SERVED)
        // ครัวยกเลิกไป = ยอดหายไปจากบิล บอกไว้จะได้ไม่งงว่าทำไมยอดไม่ตรงที่ลูกค้าสั่ง
        const cancelled = mine.filter((o) => o.status === OrderStatus.CANCELLED)

        // คำขอเก่าอาจเป็น CARD ที่ร้านเลิกรับแล้ว (backend ไม่รับ) — ถือว่ายังไม่ได้เลือก
        const customerMethod = payMethods.find((m) => m === checkout?.paymentMethod)

        let state: TileState
        if (unpaid.length === 0) state = 'settled'
        else if (notServed.length > 0) state = 'serving'
        else state = checkout ? 'checkout' : 'ready'

        return {
          session,
          state,
          notServed,
          cancelled,
          // เปิดโต๊ะไว้แต่ยังไม่มีออเดอร์เลย (หรือโดนยกเลิกหมด) — คนละเรื่องกับจ่ายครบแล้ว
          neverOrdered: mine.length === cancelled.length,
          customerMethod,
        }
      })
      .sort(
        (a, b) =>
          stateOrder[a.state] - stateOrder[b.state] ||
          a.session.tableName.localeCompare(b.session.tableName, 'th', {
            numeric: true,
          }),
      )
  }, [sessions, requests, orders])

  const keyword = search.trim()
  const visible = keyword
    ? rows.filter((r) => r.session.tableName.includes(keyword))
    : rows

  const totalOutstanding = rows.reduce((sum, r) => sum + sessionDue(r.session), 0)
  const waitingCount = rows.filter((r) => r.state === 'checkout').length

  const openPayment = (row: TableRow) =>
    setTarget({
      sessionId: row.session.id,
      tableName: row.session.tableName,
      method: row.customerMethod ?? PaymentMethod.CASH,
      amountDue: row.session.total,
      chosenByCustomer: Boolean(row.customerMethod),
      split: row.session.split,
      lines: (orders ?? [])
        .filter((o) => o.tableSessionId === row.session.id && o.status === OrderStatus.SERVED)
        .flatMap((o) =>
          o.items.map((item) => ({
            id: item.id,
            name: item.menuItemName,
            options: item.optionNames,
            quantity: item.quantity,
            each: item.unitPrice + item.optionsTotal,
          })),
        ),
    })

  // ไม่มีข้อมูลโต๊ะเลยเพราะโหลดไม่ขึ้น — ห้ามแสดงว่า "ไม่มีโต๊ะ"
  const sessionsFailed = sessionsQuery.isError && !sessions

  return (
    <div className="mx-auto max-w-7xl">
      <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start lg:gap-8">
        <section aria-labelledby="check-heading">
          <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
            <div>
              <h1 id="check-heading" className="text-2xl font-bold text-black">
                เช็คบิล
              </h1>
              {!sessionsFailed && sessions && (
                <p className="mt-1 text-base text-gray-600">
                  เปิดอยู่ <b className="text-black">{rows.length}</b> โต๊ะ · ค้างรับรวม{' '}
                  <b className="text-black tabular-nums">
                    {formatBaht(totalOutstanding)}
                  </b>
                  {waitingCount > 0 && (
                    <>
                      {' · '}
                      <b className="text-brand-500">ขอเช็คบิล {waitingCount} โต๊ะ</b>
                    </>
                  )}
                </p>
              )}
              {sessionsQuery.dataUpdatedAt > 0 && (
                <p className="mt-0.5 text-sm text-gray-600">
                  อัปเดตเองอัตโนมัติ · ล่าสุด{' '}
                  <span className="tabular-nums">
                    {new Date(sessionsQuery.dataUpdatedAt).toLocaleTimeString('th-TH')}
                  </span>
                </p>
              )}
            </div>

            {rows.length > 4 && (
              <label className="relative w-full sm:w-56">
                <span className="sr-only">ค้นหาเลขโต๊ะ (กด / เพื่อค้นหา)</span>
                <kbd
                  aria-hidden
                  className="pointer-events-none absolute top-1/2 right-3 hidden -translate-y-1/2 rounded border border-gray-300 px-1.5 text-sm text-gray-600 sm:block"
                >
                  /
                </kbd>
                <input
                  ref={searchRef}
                  type="search"
                  inputMode="numeric"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="ค้นหาเลขโต๊ะ"
                  className={`${field} mt-0 pr-10`}
                />
              </label>
            )}
          </div>

          <div className="mt-5">
            {sessionsQuery.isError && (
              <LoadError
                what="รายการโต๊ะ"
                stale={Boolean(sessions)}
                error={sessionsQuery.error}
                onRetry={() => sessionsQuery.refetch()}
              />
            )}
            {/* ออเดอร์โหลดไม่ขึ้น = บอกไม่ได้ว่าโต๊ะไหนเสิร์ฟครบ ต้องเตือน */}
            {!sessionsQuery.isError && ordersQuery.isError && (
              <LoadError
                what="สถานะออเดอร์"
                stale={Boolean(orders)}
                error={ordersQuery.error}
                onRetry={() => ordersQuery.refetch()}
              />
            )}

            <ErrorNote error={createPayment.error} />

            {sessionsQuery.isPending && <TileSkeleton />}

            {!sessionsQuery.isPending && !sessionsFailed && rows.length === 0 && (
              <div className="rounded-xl border-2 border-gray-200 px-6 py-12 text-center">
                <p className="text-lg font-bold text-black">ยังไม่มีโต๊ะที่เปิดอยู่</p>
                <p className="mt-1 text-sm text-gray-600">
                  เปิดโต๊ะและพิมพ์ QR ให้ลูกค้าก่อน แล้วโต๊ะจะขึ้นที่นี่เมื่อสั่งอาหาร
                </p>
                {canOpenTable && (
                  <Link
                    to="/employee/tables"
                    className={`${button('primary', 'lg')} mt-5`}
                  >
                    เปิดโต๊ะใหม่
                  </Link>
                )}
              </div>
            )}

            {rows.length > 0 && visible.length === 0 && (
              <p className="rounded-xl border-2 border-gray-200 px-6 py-10 text-center text-sm text-gray-600">
                ไม่พบโต๊ะ “{keyword}”
              </p>
            )}

            <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {visible.map((row) => (
                <li key={row.session.id} className="flex">
                  <TableTile
                    row={row}
                    closeDisabled={closeSession.isPending}
                    onCharge={() => openPayment(row)}
                    onClose={() =>
                      setClosing({
                        session: row.session,
                        neverOrdered: row.neverOrdered,
                      })
                    }
                  />
                </li>
              ))}
            </ul>
          </div>
        </section>

        <aside className="mt-10 space-y-6 lg:sticky lg:top-4 lg:mt-0">
          <CashDrawerBar />
          {/* บิล PromptPay ที่ยังยืนยันเงินเข้าไม่ได้ (ทุกวัน) — ซ่อนเองถ้าไม่มี */}
          <SlipIssues />
        </aside>
      </div>

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
              onSuccess: () => {
                toast(`ปิดโต๊ะ ${closing.session.tableName} แล้ว โต๊ะกลับเป็นว่าง`)
                setClosing(null)
              },
            })
          }
        />
      )}

      {receipt && (
        <ReceiptDialog
          payment={receipt.payment}
          tendered={receipt.tendered}
          justPaid
          onClose={() => setReceipt(null)}
        />
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
          onSubmit={({ method, note, discountPercent, slip, tendered, scope }) =>
            createPayment.mutate(
              {
                tableSessionId: target.sessionId,
                method,
                tableName: target.tableName,
                note,
                // PromptPay: ส่งข้อความ QR ของสลิปให้ backend ตรวจกับ SlipOK
                ...(method === PaymentMethod.PROMPTPAY ? slipFields(slip) : {}),
                // ยอดที่ลูกค้าเห็นบนจอ/QR — ถ้ายอดจริงเปลี่ยนไประหว่างนี้ backend จะไม่ยอมบันทึก
                expectedTotal: scope.expectedTotal,
                items: scope.items,
                splitParts: scope.splitParts,
                // ส่งแค่ % — backend คิดยอดส่วนลดเองด้วยสูตรเดียวกับหน้าจอ
                discountPercent,
              },
              {
                // ยืนยันผลด้วยแถบบนใบเสร็จ (รับเงิน/ทอน) แทน toast ที่จะจมใต้กล่องใบเสร็จ
                onSuccess: (payment) => {
                  setTarget(null)
                  setReceipt({ payment, tendered })
                },
              },
            )
          }
        />
      )}
    </div>
  )
}

const stateBadge: Record<TileState, { dot: string; box: string }> = {
  checkout: { dot: 'bg-brand-400', box: 'bg-brand-50 text-brand-500' },
  ready: { dot: 'bg-success', box: 'bg-gray-100 text-gray-700' },
  serving: { dot: 'bg-status-cooking', box: 'bg-gray-100 text-gray-700' },
  settled: { dot: 'bg-gray-400', box: 'bg-gray-100 text-gray-700' },
}

/** บิลโต๊ะหนึ่งใบ แบบกะทัดรัด — หัวโต๊ะ+สถานะ แล้วยอดกับปุ่มเดียวอยู่แถวเดียวกัน */
function TableTile({
  row,
  closeDisabled,
  onCharge,
  onClose,
}: Readonly<{
  row: TableRow
  closeDisabled: boolean
  onCharge: () => void
  onClose: () => void
}>) {
  const { session, state, notServed, cancelled, neverOrdered, customerMethod } = row
  const badge = stateBadge[state]
  const due = sessionDue(session)
  const split = session.split

  const badgeText = {
    checkout: 'ขอเช็คบิล',
    ready: 'เสิร์ฟครบแล้ว',
    serving: `รอเสิร์ฟ ${notServed.length} ออเดอร์`,
    settled: neverOrdered ? 'ยังไม่ได้สั่ง' : 'เก็บเงินครบแล้ว',
  }[state]

  return (
    <article
      className={`w-full rounded-xl border-2 bg-white px-4 py-3 ${
        state === 'checkout' ? 'border-brand-400' : 'border-gray-200'
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-xl font-bold text-black">โต๊ะ {session.tableName}</h2>
          <p className="text-sm text-gray-600">
            เปิด {formatTime(session.openedAt)}
            {state !== 'settled' &&
              (customerMethod
                ? ` · ลูกค้าเลือก${methodLabel[customerMethod]}`
                : ' · ยังไม่เลือกวิธีจ่าย')}
          </p>
        </div>
        <span
          className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-0.5 text-sm font-semibold ${badge.box}`}
        >
          <span aria-hidden className={`h-2 w-2 rounded-full ${badge.dot}`} />
          {badgeText}
        </span>
      </div>

      <div className="mt-2 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p
            className={`text-2xl font-bold tabular-nums ${
              state === 'settled' ? 'text-gray-500' : 'text-black'
            }`}
          >
            {formatBaht(due)}
          </p>
          {split && (
            <p className="text-sm font-semibold text-brand-500">
              หาร {split.parts} คน · จ่ายแล้ว {split.paidParts} คน
            </p>
          )}
          {cancelled.length > 0 && (
            <p className="text-sm text-danger-ink">ครัวยกเลิก {cancelled.length} ออเดอร์</p>
          )}
        </div>

        {(state === 'checkout' || state === 'ready') && (
          <button
            type="button"
            onClick={onCharge}
            aria-label={`รับเงิน โต๊ะ ${session.tableName} ${formatBaht(due)}`}
            className={`${button('primary')} shrink-0 px-6`}
          >
            {split ? `รับเงินคนที่ ${split.paidParts + 1}` : 'รับเงิน'}
          </button>
        )}

        {state === 'serving' && (
          <p className="shrink-0 text-right text-sm text-gray-600">
            รับเงินได้
            <br />
            เมื่อเสิร์ฟครบ
          </p>
        )}

        {state === 'settled' && (
          <button
            type="button"
            disabled={closeDisabled}
            onClick={onClose}
            className={`${button('secondary')} shrink-0`}
          >
            ปิดโต๊ะ
          </button>
        )}
      </div>
    </article>
  )
}

function TileSkeleton() {
  return (
    <div aria-hidden className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {[0, 1, 2].map((i) => (
        <div key={i} className="h-28 animate-pulse rounded-xl bg-gray-100" />
      ))}
    </div>
  )
}

function PaymentDialog({
  target,
  isSaving,
  error,
  canOverrideSlip,
  onCancel,
  onSubmit,
}: Readonly<{
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
    /** ส่วนลด % (1-100) — undefined = ไม่ลด */
    discountPercent?: number
    slip: SlipInput
    /** เงินที่ลูกค้ายื่นมา (เงินสด) — ไว้โชว์เงินทอนบนใบเสร็จ ไม่ได้บันทึก */
    tendered: number | null
    /** เก็บเงินส่วนไหน + ยอดก่อนส่วนลดที่หน้าจอใช้ (backend ตรวจซ้ำ) */
    scope: {
      expectedTotal: number
      items?: { orderItemId: Id; quantity: number }[]
      splitParts?: number
    }
  }) => void
}>) {
  /**
   * แยกสองยอดออกจากกัน
   * - charged  = ยอดที่บันทึกเป็นรายได้ = ยอดบิล − ส่วนลด % (ลูกค้าประจำ/ของมีตำหนิ)
   * - received = เงินที่ลูกค้ายื่นมา ใช้คิดเงินทอนอย่างเดียว ไม่ได้บันทึก
   */
  const [percent, setPercent] = useState('')
  const [received, setReceived] = useState('')
  const [note, setNote] = useState('')
  // โต๊ะที่ลูกค้าไม่ได้กดเช็คบิลจาก QR ต้องให้พนักงานเลือกวิธีจ่ายเอง
  const [method, setMethod] = useState<PaymentMethod>(target.method)
  const [slip, setSlip] = useState<SlipInput>(emptySlipInput)
  /** ส่วนลดซ่อนไว้หลังปุ่ม "ให้ส่วนลด" — กันกรอกผิดช่องตอนรีบ และใช้ไม่บ่อย */
  const [discountOpen, setDiscountOpen] = useState(false)
  const [discountReason, setDiscountReason] = useState('')
  // แยกบิล: โต๊ะที่หารค้างอยู่ ล็อกเป็นหารต่อ (จำนวนคน/ส่วนลดตามที่เริ่มไว้)
  const split = target.split
  const [scope, setScope] = useState<BillScope>(split ? 'even' : 'all')
  const [picked, setPicked] = useState<Record<Id, number>>({})
  const [parts, setParts] = useState(split?.parts ?? 2)

  const pickedItems = target.lines
    .filter((line) => (picked[line.id] ?? 0) > 0)
    .map((line) => ({ orderItemId: line.id, quantity: picked[line.id] }))
  // คิดเป็นสตางค์ กันทศนิยม float เพี้ยน
  const pickedTotal =
    target.lines.reduce(
      (sum, line) => sum + Math.round(line.each * 100) * (picked[line.id] ?? 0),
      0,
    ) / 100
  /** ยอดก่อนส่วนลดของส่วนที่กำลังเก็บ (ส่งเป็น expectedTotal) */
  const base = split ? split.subtotal : scope === 'items' ? pickedTotal : target.amountDue

  const isPromptPay = method === PaymentMethod.PROMPTPAY
  const percentNum = Number(percent)
  const percentEmpty = percent.trim() === ''
  const percentValid = percentEmpty || isValidDiscountPercent(percentNum)
  const hasDiscount = !percentEmpty && isValidDiscountPercent(percentNum)
  const applied = applyDiscountPercent(base, hasDiscount ? percentNum : 0)
  const discount = applied.discount
  /** ยอดทั้งบิลหลังส่วนลด (หารค้างอยู่ = ยอดที่ล็อกไว้ตอนเริ่มหาร) */
  const billTotal = split ? split.total : applied.charged
  const isEven = scope === 'even'
  /** ยอดที่เก็บครั้งนี้ — หารเท่ากัน = ส่วนของคนนี้ */
  const chargedNum = split
    ? split.nextAmount
    : isEven
      ? splitShare(billTotal, parts)
      : billTotal
  const lastShare = splitShare(billTotal, parts, parts - 1, splitShare(billTotal, parts) * (parts - 1))
  const receivedNum = Number(received) || 0
  // PromptPay ต้องมีสลิปให้ตรวจ (หรือ ADMIN ยืนยันเอง) — backend ก็บังคับไว้อีกชั้น
  // ลดราคาต้องมีเหตุผลเสมอ เหมือนยกเลิกบิล
  const canSubmit =
    percentValid &&
    (scope !== 'items' || pickedItems.length > 0) &&
    (!isPromptPay || isSlipReady(slip)) &&
    (!hasDiscount || discountReason.trim() !== '')
  const change = receivedNum - chargedNum
  const chargeAmount = chargedNum

  // QR ผูกยอดเงินไว้ด้วย ลูกค้าจึงไม่ต้องกรอกยอดเอง
  const qrPayload =
    isPromptPay && PROMPTPAY_ID ? buildPromptPayPayload(PROMPTPAY_ID, chargedNum || 0) : ''

  return (
    <Modal title={`รับเงิน โต๊ะ ${target.tableName}`} onClose={onCancel}>
      <ErrorNote error={error} />
      <form
        onSubmit={(e) => {
          e.preventDefault()
          if (!canSubmit) return
          // เหตุผลส่วนลดเก็บรวมในหมายเหตุของบิล (backend มีช่อง note ช่องเดียว) — พิมพ์ลงใบเสร็จและดูย้อนหลังได้
          const noteParts = [
            hasDiscount
              ? `ส่วนลด ${percentNum}% (${formatBaht(discount)}): ${discountReason.trim()}`
              : '',
            note.trim(),
          ].filter(Boolean)
          onSubmit({
            method,
            note: noteParts.join(' · '),
            discountPercent: split ? undefined : hasDiscount ? percentNum : undefined,
            slip,
            tendered: !isPromptPay && receivedNum > 0 ? receivedNum : null,
            scope: {
              expectedTotal: base,
              ...(scope === 'items' && !split ? { items: pickedItems } : {}),
              ...(isEven ? { splitParts: split?.parts ?? parts } : {}),
            },
          })
        }}
      >
        <div className="flex items-baseline justify-between rounded-lg bg-brand-50 px-4 py-3">
          <span className="text-sm font-semibold text-gray-700">
            {isEven
              ? `คนที่ ${(split?.paidParts ?? 0) + 1} จาก ${split?.parts ?? parts}`
              : scope === 'items'
                ? 'รายการที่เลือก'
                : 'ยอดที่ต้องจ่าย'}
            {(isEven || scope === 'items') && (
              <span className="block font-normal text-gray-600 tabular-nums">
                ทั้งโต๊ะ {formatBaht(isEven ? billTotal : target.amountDue)}
              </span>
            )}
          </span>
          <span className="text-2xl font-bold text-black tabular-nums">
            {formatBaht(isEven ? chargedNum : base)}
          </span>
        </div>

        <BillScopePicker
          scope={scope}
          onScope={setScope}
          lines={target.lines}
          picked={picked}
          onPick={(id, quantity) => setPicked((prev) => ({ ...prev, [id]: quantity }))}
          parts={parts}
          onParts={setParts}
          split={split}
          share={splitShare(billTotal, parts)}
          lastShare={lastShare}
        />

        {/* เลือกได้เสมอ — ลูกค้าอาจกดเช็คบิลเลือก PromptPay ไว้ แต่มาจ่ายเงินสดจริง
            เดิมซ่อนปุ่มไว้เลยต้องบันทึกผิดวิธี ยอดแยกตามวิธีจ่ายในรายงานก็ผิดตาม */}
        <fieldset className="mt-4">
          <legend className={fieldLabel}>วิธีจ่าย</legend>
          {target.chosenByCustomer && (
            <p className="mt-0.5 text-sm text-gray-600">
              ลูกค้าเลือก{methodLabel[target.method] ?? target.method}ไว้ เปลี่ยนได้ถ้าจ่ายจริงต่างจากนี้
            </p>
          )}
          <div className="mt-2 grid grid-cols-2 gap-3">
            {payMethods.map((m) => (
              <button
                key={m}
                type="button"
                aria-pressed={method === m}
                onClick={() => setMethod(m)}
                className={`min-h-12 rounded-lg border-2 text-base font-bold transition ${
                  method === m
                    ? 'border-brand-400 bg-brand-50 text-brand-500'
                    : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50'
                }`}
              >
                {methodLabel[m]}
              </button>
            ))}
          </div>
        </fieldset>

        {isPromptPay && (
          <div className="mt-4 flex flex-col items-center rounded-xl border-2 border-promptpay/30 bg-promptpay/5 p-4">
            {qrPayload ? (
              <>
                <p className="mb-2 text-sm font-bold text-black">ให้ลูกค้าสแกนเพื่อจ่าย</p>
                <div className="rounded-lg bg-white p-3">
                  <QRCodeSVG value={qrPayload} size={180} />
                </div>
              </>
            ) : (
              <p className="text-center text-sm font-semibold text-danger-ink">
                <span>ยังไม่ได้ตั้งเบอร์พร้อมเพย์ของร้าน (VITE_PROMPTPAY_ID) — สร้าง QR ไม่ได้</span>
                <span className="block font-normal text-gray-700">
                  ให้ลูกค้าโอนเข้าบัญชีร้านเอง แล้วแนบสลิปด้านล่าง
                </span>
              </p>
            )}
            <p className="mt-2 text-lg font-bold text-black tabular-nums">
              {formatBaht(chargedNum || 0)}
            </p>

            {IS_DEMO_PROMPTPAY && qrPayload && (
              <p className="mt-2 text-center text-sm text-danger-ink">
                โหมดเดโม — ยังไม่ได้ตั้ง VITE_PROMPTPAY_ID
                สแกนแล้วจะไม่พบบัญชีปลายทาง
              </p>
            )}
          </div>
        )}

        {isPromptPay && (
          <div className="mt-4">
            <SlipScanField value={slip} onChange={setSlip} canOverride={canOverrideSlip} />
          </div>
        )}

        {/* เงินสด: งานหลักคือรับเงินแล้วทอน — ช่องรับเงินกับปุ่มแบงก์ขึ้นก่อนเสมอ ส่วนลดอยู่หลังปุ่มแยก */}
        {!isPromptPay && (
          <div className="mt-4">
            <label className="block">
              <span className={fieldLabel}>รับเงินมา</span>
              <span className="ml-1 text-sm text-gray-600">(ไว้คิดเงินทอน ไม่บันทึก)</span>
              <input
                type="number"
                inputMode="decimal"
                min="0"
                step="0.01"
                value={received}
                onChange={(e) => setReceived(e.target.value)}
                placeholder="ไม่กรอกก็ได้"
                className={`${field} tabular-nums`}
              />
            </label>
            {chargedNum > 0 && (
              <fieldset className="mt-2 flex flex-wrap gap-2">
                <legend className="sr-only">จำนวนเงินที่รับมา</legend>
                {quickCash(chargedNum).map((amount, i) => (
                  <button
                    key={amount}
                    type="button"
                    aria-pressed={receivedNum === amount}
                    onClick={() => setReceived(String(amount))}
                    className={`min-h-11 flex-1 rounded-lg border-2 px-3 text-sm font-bold tabular-nums transition ${
                      receivedNum === amount
                        ? 'border-brand-500 bg-brand-50 text-brand-500'
                        : 'border-gray-300 bg-white text-black hover:bg-gray-50'
                    }`}
                  >
                    {i === 0 ? `พอดี ${formatBaht(amount)}` : formatBaht(amount)}
                  </button>
                ))}
              </fieldset>
            )}
            {/* ยังบันทึกได้ (ช่องนี้ไว้คิดเงินทอนเฉย ๆ) แต่ต้องเตือนให้เห็น จะได้ไม่ปล่อยลูกค้าไปทั้งที่เงินขาด */}
            {receivedNum > 0 && change < 0 && (
              <p className="mt-2 text-right text-sm font-semibold text-danger-ink">
                รับเงินมาไม่พอ ขาดอีก {formatBaht(-change)}
              </p>
            )}
            {change > 0 && (
              <p className="mt-2 flex items-baseline justify-between rounded-lg bg-gray-100 px-4 py-2">
                <span className="text-sm font-semibold text-gray-700">เงินทอน</span>
                <span className="text-2xl font-bold text-black tabular-nums">
                  {formatBaht(change)}
                </span>
              </p>
            )}
          </div>
        )}

        {/* ส่วนลด: ซ่อนไว้จนกว่าจะกดเปิด และต้องมีเหตุผลทุกครั้ง — เงินต้องตรวจสอบย้อนหลังได้ */}
        {split ? null : discountOpen ? (
          <fieldset className="mt-4 rounded-lg border-2 border-gray-200 p-3">
            <legend className={`${fieldLabel} px-1`}>ส่วนลด</legend>
            <label className="block">
              <span className={fieldLabel}>ลดกี่ %</span>
              <span className="ml-1 text-sm text-gray-600">(1-100)</span>
              <div className="relative">
                <input
                  type="number"
                  inputMode="numeric"
                  min="1"
                  max="100"
                  step="1"
                  value={percent}
                  onChange={(e) => setPercent(e.target.value)}
                  aria-invalid={!percentValid}
                  placeholder="เช่น 10"
                  className={`${field} pr-10 tabular-nums`}
                />
                <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-gray-600">
                  %
                </span>
              </div>
            </label>
            {/* % ที่ใช้บ่อย กดทีเดียวไม่ต้องพิมพ์ */}
            <div className="mt-2 flex flex-wrap gap-2">
              {QUICK_DISCOUNT_PERCENTS.map((p) => (
                <button
                  key={p}
                  type="button"
                  aria-pressed={percentNum === p}
                  onClick={() => setPercent(String(p))}
                  className={`${button(percentNum === p ? 'primary' : 'secondary', 'sm')} tabular-nums`}
                >
                  {p}%
                </button>
              ))}
            </div>
            {!percentValid && (
              <p className="mt-1 text-sm font-semibold text-danger-ink">
                ใส่เป็นจำนวนเต็ม 1-100
              </p>
            )}
            {hasDiscount && (
              <>
                <p className="mt-2 flex justify-between text-sm font-semibold">
                  <span className="text-danger-ink">ลด {formatBaht(discount)}</span>
                  <span className="text-black tabular-nums">เก็บจริง {formatBaht(chargedNum)}</span>
                </p>
                <label className="mt-2 block">
                  <span className={fieldLabel}>
                    เหตุผลที่ลด<span className="ml-1 text-danger-ink">*</span>
                  </span>
                  <input
                    value={discountReason}
                    onChange={(e) => setDiscountReason(e.target.value)}
                    maxLength={200}
                    required
                    aria-invalid={!discountReason.trim()}
                    placeholder="เช่น ลูกค้าประจำ / อาหารมีปัญหา"
                    className={field}
                  />
                </label>
              </>
            )}
            <button
              type="button"
              onClick={() => {
                setPercent('')
                setDiscountReason('')
                setDiscountOpen(false)
              }}
              className={`${button('secondary', 'sm')} mt-3`}
            >
              ไม่ลดแล้ว
            </button>
          </fieldset>
        ) : (
          <button
            type="button"
            aria-expanded={false}
            onClick={() => setDiscountOpen(true)}
            className={`${button('secondary', 'sm')} mt-4`}
          >
            ให้ส่วนลด
          </button>
        )}

        <label className="mt-4 block">
          <span className={fieldLabel}>หมายเหตุ</span>
          <span className="ml-1 text-sm text-gray-600">(พิมพ์ลงใบเสร็จ ไม่กรอกก็ได้)</span>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={2}
            maxLength={300}
            className={`${field} resize-none`}
          />
        </label>

        <div className="mt-5 grid grid-cols-2 gap-3">
          <button type="button" onClick={onCancel} className={button('secondary', 'lg')}>
            ย้อนกลับ
          </button>
          <button
            type="submit"
            disabled={isSaving || !canSubmit}
            className={button('primary', 'lg')}
          >
            {isSaving
              ? 'กำลังบันทึก...'
              : `รับเงิน ${formatBaht(chargeAmount)}`}
          </button>
        </div>
        {hasDiscount && !discountReason.trim() && (
          <p className="mt-2 text-center text-sm text-danger-ink">ใส่เหตุผลที่ลดก่อนรับเงิน</p>
        )}
      </form>
    </Modal>
  )
}

/** ปุ่ม % ส่วนลดที่ใช้บ่อย */
const QUICK_DISCOUNT_PERCENTS = [5, 10, 15, 20] as const

/**
 * ปุ่มเงินด่วน: ยอดพอดี + ยอดที่ปัดขึ้นเป็นแบงก์ถัดไป (50 / 100 / 500 / 1000) ไม่ซ้ำกัน สูงสุด 4 ปุ่ม
 * เช่น ฿120 → พอดี ฿120, ฿150, ฿200, ฿500
 */
/** PromptPay: ส่งข้อความ QR ของสลิปให้ backend ตรวจกับ SlipOK หรือเหตุผลที่ ADMIN ยืนยันเอง */
function slipFields(slip: SlipInput) {
  return slip.override
    ? { slipOverrideReason: slip.overrideReason.trim() }
    : { slipPayload: slip.payload.trim() }
}

function quickCash(amount: number) {
  const steps = [50, 100, 500, 1000].map((note) => Math.ceil(amount / note) * note)
  return [...new Set([amount, ...steps])].filter((v) => v >= amount).slice(0, 4)
}
