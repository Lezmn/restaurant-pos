import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { ErrorNote } from '@/components/ui/ErrorNote'
import { LoadError } from '@/components/ui/LoadError'
import { Modal } from '@/components/ui/Modal'
import { button, field, fieldLabel } from '@/components/ui/styles'
import { toast } from '@/components/ui/toast'
import { pageRoles } from '@/features/auth/permissions'
import { useOrders } from '@/features/orders/hooks'
import { useAuth } from '@/features/auth/use-auth'
import { useCreatePayment, useSlipIssuePayments } from '@/features/payments/hooks'
import { useServiceRequests } from '@/features/service-requests/hooks'
import { useCloseSession, useSessions } from '@/features/table-sessions/hooks'
import { IS_DEMO_PROMPTPAY, PROMPTPAY_ID } from '@/lib/config'
import { applyDiscountPercent, isValidDiscountPercent } from '@/lib/discount'
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
import { CashDrawerBar } from './CashDrawerBar'
import { PaidBills } from './PaidBills'
import { ReceiptDialog } from './ReceiptDialog'
import { SlipIssues } from './SlipIssues'
import { emptySlipInput, isSlipReady, type SlipInput } from './slip-input'
import { SlipScanField } from './SlipScanField'
import { QRCodeSVG } from 'qrcode.react'
import { useMemo, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { RequiredMark } from '@/components/ui/RequiredMark'

const POLL_MS = LIVE_POLL_MS

const methodLabel: Record<string, string> = {
  [PaymentMethod.CASH]: 'เงินสด',
  [PaymentMethod.PROMPTPAY]: 'PromptPay',
}

const payMethods = [PaymentMethod.CASH, PaymentMethod.PROMPTPAY] as const

interface PayTarget {
  sessionId: Id
  tableName: string
  /** "โต๊ะ 5" หรือ "กลับบ้าน #3 · คุณเอ" */
  placeLabel: string
  isTakeaway: boolean
  method: PaymentMethod
  amountDue: number
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
 * - serving:  ยังเสิร์ฟไม่ครบ — backend ไม่ยอมให้จ่าย (ถ้าลูกค้าขอบิลแล้ว ดู checkoutRequested)
 * - settled:  ไม่มียอดให้เก็บ (จ่ายครบ/ยกเลิกหมด/ยังไม่สั่ง) — ปิดโต๊ะได้
 */
type TileState = 'checkout' | 'ready' | 'serving' | 'settled'
const stateOrder: Record<TileState, number> = {
  checkout: 0,
  ready: 1,
  serving: 2,
  settled: 3,
}

/**
 * ลำดับบนจอ — โต๊ะที่ขอเช็คบิลแต่ยังรอเสิร์ฟ ขึ้นต่อจาก checkout (ลูกค้ารอจ่ายอยู่)
 * เรียงแค่การ์ดในหน้านี้ ไม่ได้เปลี่ยนคิวครัว
 */
const urgency = (row: TableRow) =>
  row.state === 'serving' && row.checkoutRequested ? 0.5 : stateOrder[row.state]

interface TableRow {
  session: TableSession
  state: TileState
  /** ลูกค้ากด "แจ้งชำระเงิน" แล้ว — รวมโต๊ะที่ยังรอเสิร์ฟด้วย (state เป็น serving แต่ต้องให้แคชเชียร์เห็น) */
  checkoutRequested: boolean
  notServed: Order[]
  cancelled: Order[]
  neverOrdered: boolean
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
          (o) => !o.paid && o.status !== OrderStatus.CANCELLED,
        )
        const notServed = unpaid.filter((o) => o.status !== OrderStatus.SERVED)
        // ครัวยกเลิกไป = ยอดหายไปจากบิล บอกไว้จะได้ไม่งงว่าทำไมยอดไม่ตรงที่ลูกค้าสั่ง
        const cancelled = mine.filter((o) => o.status === OrderStatus.CANCELLED)

        let state: TileState
        if (unpaid.length === 0) state = 'settled'
        // กลับบ้านจ่ายก่อนทำได้ (backend ยอม) — ไม่ต้องรอครัวเสิร์ฟ
        else if (notServed.length > 0 && !session.isTakeaway) state = 'serving'
        else state = checkout ? 'checkout' : 'ready'

        return {
          session,
          state,
          checkoutRequested: Boolean(checkout) && state !== 'settled',
          notServed,
          cancelled,
          // เปิดโต๊ะไว้แต่ยังไม่มีออเดอร์เลย (หรือโดนยกเลิกหมด) — คนละเรื่องกับจ่ายครบแล้ว
          neverOrdered: mine.length === cancelled.length,
        }
      })
      .sort(
        (a, b) =>
          urgency(a) - urgency(b) ||
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
  // นับทุกโต๊ะที่ลูกค้าแจ้งแล้ว แม้ยังรอเสิร์ฟ — ลูกค้าเห็นว่า "แจ้งพนักงานแล้ว" ตั้งแต่กด
  const waitingCount = rows.filter((r) => r.checkoutRequested).length

  const toPayTarget = (row: TableRow): PayTarget => ({
    sessionId: row.session.id,
    tableName: row.session.tableName,
    placeLabel: row.session.placeLabel,
    isTakeaway: row.session.isTakeaway,
    // ลูกค้าไม่ได้เลือกวิธีจ่าย — แคชเชียร์เลือกเองในกล่องรับเงิน
    method: PaymentMethod.CASH,
    amountDue: row.session.total,
    split: row.session.split,
  })
  const openPayment = (row: TableRow) => setTarget(toPayTarget(row))

  // หน้า POS กลับบ้านส่งมาที่ ?pay=<sessionId> = เปิดหน้ารับเงินของบิลนั้นให้เลย
  // (คิดจาก URL ตอน render ไม่ต้องใช้ effect — ปิดกล่องแล้วล้าง ?pay ทิ้ง)
  const [searchParams, setSearchParams] = useSearchParams()
  const payParam = searchParams.get('pay')
  // มาจากหน้ากลับบ้านที่กด "จ่ายเงินสด" / "จ่าย PromptPay" — เลือกวิธีจ่ายไว้ให้เลย
  const payMethodParam = payMethods.find((m) => m === searchParams.get('method'))
  const payRow = payParam
    ? rows.find(
        (r) => r.session.id === payParam && (r.state === 'checkout' || r.state === 'ready'),
      )
    : undefined
  const activeTarget =
    target ??
    (payRow
      ? { ...toPayTarget(payRow), ...(payMethodParam ? { method: payMethodParam } : {}) }
      : null)
  const finishPayment = () => {
    setTarget(null)
    if (payParam) setSearchParams({}, { replace: true })
  }

  // ไม่มีข้อมูลโต๊ะเลยเพราะโหลดไม่ขึ้น — ห้ามแสดงว่า "ไม่มีโต๊ะ"
  const sessionsFailed = sessionsQuery.isError && !sessions
  // query เดียวกับ SlipIssues (แคชร่วมกัน) — ใช้แค่ตัดสิน layout
  const hasSlipIssues = Boolean(useSlipIssuePayments().data?.length)

  return (
    <div className="mx-auto max-w-7xl">
      {/* มีสลิปค้าง: แถบข้างคร่อมทุกแถว แถวที่ 3 (1fr) รับความสูงส่วนเกิน ไม่งั้นเกลี่ยไปแถวการ์ด/ตาราง เกิดช่องว่างคั่น
          ไม่มีสลิปค้าง: แถบข้างเหลือแค่ลิ้นชัก (สั้น) — ตารางบิลลงไปกว้างเต็มใต้ทั้งสองคอลัมน์ ไม่เหลือที่ว่างโล่งทางขวา */}
      <div
        className={`lg:grid lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start lg:gap-x-8 ${
          hasSlipIssues ? 'lg:grid-rows-[auto_auto_1fr]' : ''
        }`}
      >
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
                <input
                  ref={searchRef}
                  type="search"
                  inputMode="numeric"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="ค้นหาเลขโต๊ะ"
                  className={`${field} mt-0`}
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

        {/* มีสลิปค้าง: แถบข้างคร่อมทุกแถว (การ์ดโต๊ะ + บิลที่เก็บแล้ว) — สูงแค่ไหนก็ไม่ดันตารางบิลลง */}
        <aside
          className={`mt-10 space-y-6 lg:col-start-2 lg:row-start-1 lg:mt-0 ${
            hasSlipIssues ? 'lg:sticky lg:top-4 lg:row-span-3' : ''
          }`}
        >
          <CashDrawerBar />
          {/* บิล PromptPay ที่ยังยืนยันเงินเข้าไม่ได้ (ทุกวัน) — ซ่อนเองถ้าไม่มี */}
          <SlipIssues />
        </aside>

        <div className={hasSlipIssues ? 'lg:col-start-1' : 'lg:col-span-2'}>
          <PaidBills />
        </div>
      </div>

      {closing && (
        <ConfirmDialog
          title={closing.session.isTakeaway ? 'ปิดบิล' : 'ปิดโต๊ะ'}
          subject={closing.session.placeLabel}
          detail={
            closing.neverOrdered
              ? 'ยังไม่ได้สั่งอาหาร'
              : 'เก็บเงินครบแล้ว ไม่มียอดค้างชำระ'
          }
          consequence={
            closing.session.isTakeaway
              ? 'บิลกลับบ้านนี้จะหายจากหน้าเช็คบิล'
              : 'QR ของโต๊ะนี้จะใช้สั่งอาหารไม่ได้อีก และโต๊ะจะกลับเป็นว่าง'
          }
          confirmLabel={closing.session.isTakeaway ? 'ปิดบิล' : 'ปิดโต๊ะ'}
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
                toast(
                  closing.session.isTakeaway
                    ? `ปิดบิล ${closing.session.placeLabel} แล้ว`
                    : `ปิด${closing.session.placeLabel} แล้ว โต๊ะกลับเป็นว่าง`,
                )
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

      {activeTarget && (
        <PaymentDialog
          target={activeTarget}
          isSaving={createPayment.isPending}
          error={createPayment.error}
          onCancel={() => {
            createPayment.reset()
            finishPayment()
          }}
          canOverrideSlip={isAdmin}
          onSubmit={({ method, note, discountPercent, slip, tendered, scope }) =>
            createPayment.mutate(
              {
                tableSessionId: activeTarget.sessionId,
                method,
                tableName: activeTarget.tableName,
                isTakeaway: activeTarget.isTakeaway,
                note,
                // PromptPay: ส่งข้อความ QR ของสลิปให้ backend ตรวจกับ SlipOK
                ...(method === PaymentMethod.PROMPTPAY ? slipFields(slip) : {}),
                // ยอดที่ลูกค้าเห็นบนจอ/QR — ถ้ายอดจริงเปลี่ยนไประหว่างนี้ backend จะไม่ยอมบันทึก
                expectedTotal: scope.expectedTotal,
                splitParts: scope.splitParts,
                // ส่งแค่ % — backend คิดยอดส่วนลดเองด้วยสูตรเดียวกับหน้าจอ
                discountPercent,
              },
              {
                // ยืนยันผลด้วยแถบบนใบเสร็จ (รับเงิน/ทอน) แทน toast ที่จะจมใต้กล่องใบเสร็จ
                onSuccess: (payment) => {
                  finishPayment()
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

function StateBadge({ state, children }: Readonly<{ state: TileState; children: string }>) {
  const badge = stateBadge[state]
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-sm font-semibold ${badge.box}`}
    >
      <span aria-hidden className={`h-2 w-2 rounded-full ${badge.dot}`} />
      {children}
    </span>
  )
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
  const { session, state, checkoutRequested, notServed, cancelled, neverOrdered } = row
  const due = sessionDue(session)
  const split = session.split

  const badgeText = {
    checkout: 'ขอเช็คบิล',
    // กลับบ้านรับเงินได้ตั้งแต่ครัวยังไม่เสร็จ — บอกตามจริงว่าของยังไม่พร้อม
    ready:
      session.isTakeaway && notServed.length > 0
        ? `ครัวกำลังทำ ${notServed.length} ออเดอร์`
        : 'เสิร์ฟครบแล้ว',
    serving: `รอเสิร์ฟ ${notServed.length} ออเดอร์`,
    settled: neverOrdered ? 'ยังไม่ได้สั่ง' : 'เก็บเงินครบแล้ว',
  }[state]

  return (
    <article
      className={`w-full rounded-xl border-2 bg-white px-4 py-3 ${
        checkoutRequested ? 'border-brand-400' : 'border-gray-200'
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-xl font-bold text-black">{session.placeLabel}</h2>
          <p className="text-sm text-gray-600">
            {session.isTakeaway ? 'สั่ง' : 'เปิด'} {formatTime(session.openedAt)}
            {session.isTakeaway && state !== 'settled' && notServed.length > 0 &&
              ' · รับเงินก่อนได้'}
          </p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          {/* ขอบิลมาแล้วแต่ยังเสิร์ฟไม่ครบ — ป้ายขอเช็คบิลอยู่บน ป้ายรอเสิร์ฟบอกว่าทำไมยังรับเงินไม่ได้ */}
          {checkoutRequested && state === 'serving' && (
            <StateBadge state="checkout">ขอเช็คบิล</StateBadge>
          )}
          <StateBadge state={state}>{badgeText}</StateBadge>
        </div>
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
            aria-label={`รับเงิน ${session.placeLabel} ${formatBaht(due)}`}
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
            {session.isTakeaway ? 'ปิดบิล' : 'ปิดโต๊ะ'}
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
    /** ยอดก่อนส่วนลดที่หน้าจอใช้ (backend ตรวจซ้ำ) + รับเงินคนถัดไปของบิลที่หารค้างอยู่ */
    scope: {
      expectedTotal: number
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
  // เลิกแยกบิลแล้ว — เหลือไว้แค่ "รับเงินต่อ" ของบิลที่หารค้างไว้ก่อนหน้า (ไม่งั้นโต๊ะนั้นเก็บเงินไม่ได้)
  const split = target.split
  /** ยอดก่อนส่วนลด (ส่งเป็น expectedTotal) */
  const base = split ? split.subtotal : target.amountDue

  const isPromptPay = method === PaymentMethod.PROMPTPAY
  const percentNum = Number(percent)
  const percentEmpty = percent.trim() === ''
  const percentValid = percentEmpty || isValidDiscountPercent(percentNum)
  const hasDiscount = !percentEmpty && isValidDiscountPercent(percentNum)
  const applied = applyDiscountPercent(base, hasDiscount ? percentNum : 0)
  const discount = applied.discount
  /** ยอดที่เก็บครั้งนี้ — บิลที่หารค้างไว้ = ส่วนของคนถัดไป */
  const chargedNum = split ? split.nextAmount : applied.charged
  const receivedNum = Number(received) || 0
  // PromptPay ต้องมีสลิปให้ตรวจ (หรือ ADMIN ยืนยันเอง) — backend ก็บังคับไว้อีกชั้น
  // ลดราคาต้องมีเหตุผลเสมอ เหมือนยกเลิกบิล
  const canSubmit =
    percentValid &&
    (!isPromptPay || isSlipReady(slip)) &&
    (!hasDiscount || discountReason.trim() !== '')
  const change = receivedNum - chargedNum
  const chargeAmount = chargedNum

  // QR ผูกยอดเงินไว้ด้วย ลูกค้าจึงไม่ต้องกรอกยอดเอง
  const qrPayload =
    isPromptPay && PROMPTPAY_ID ? buildPromptPayPayload(PROMPTPAY_ID, chargedNum || 0) : ''

  return (
    <Modal title={`รับเงิน ${target.placeLabel}`} onClose={onCancel}>
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
              ...(split ? { splitParts: split.parts } : {}),
            },
          })
        }}
      >
        <div className="flex items-baseline justify-between rounded-lg bg-brand-50 px-4 py-3">
          <span className="text-sm font-semibold text-gray-700">
            {split ? `คนที่ ${split.paidParts + 1} จาก ${split.parts}` : 'ยอดที่ต้องจ่าย'}
            {split && (
              <span className="block font-normal text-gray-600 tabular-nums">
                ทั้งบิล {formatBaht(split.total)} · ค้าง {formatBaht(split.remaining)}
              </span>
            )}
          </span>
          <span className="text-2xl font-bold text-black tabular-nums">
            {formatBaht(split ? chargedNum : base)}
          </span>
        </div>

        {/* เลือกได้เสมอ — ลูกค้าอาจกดเช็คบิลเลือก PromptPay ไว้ แต่มาจ่ายเงินสดจริง
            เดิมซ่อนปุ่มไว้เลยต้องบันทึกผิดวิธี ยอดแยกตามวิธีจ่ายในรายงานก็ผิดตาม */}
        <fieldset className="mt-4">
          <legend className={fieldLabel}>วิธีจ่าย</legend>
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
              <span className={fieldLabel}>ลดกี่ %<RequiredMark /></span>
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
                    เหตุผลที่ลด<RequiredMark />
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

        {/* error อยู่ติดปุ่มรับเงิน — กล่อง PromptPay ยาวเกินจอ ถ้าอยู่หัวกล่องจะเลื่อนพ้นจอไปตอนกดปุ่มล่างสุด
            แคชเชียร์ไม่เห็นว่าสลิปไม่ผ่าน (เช่น สลิปซ้ำ) */}
        <div className="mt-4">
          <ErrorNote error={error} />
        </div>

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
