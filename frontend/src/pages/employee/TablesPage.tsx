import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { ErrorNote } from '@/components/ui/ErrorNote'
import { LoadError } from '@/components/ui/LoadError'
import { Modal } from '@/components/ui/Modal'
import { button } from '@/components/ui/styles'
import { pageRoles } from '@/features/auth/permissions'
import { useAuth } from '@/features/auth/use-auth'
import {
  useResolveServiceRequest,
  useServiceRequests,
} from '@/features/service-requests/hooks'
import {
  useCloseSession,
  useOpenSession,
  useSessions,
} from '@/features/table-sessions/hooks'
import { useTables } from '@/features/tables/hooks'
import { formatBaht, formatTime } from '@/lib/format'
import {
  ServiceRequestStatus,
  ServiceRequestType,
  TableSessionStatus,
  TableStatus,
} from '@/types/enums'
import type { RestaurantTable, ServiceRequest, TableSession } from '@/types/models'
import { RESTAURANT_NAME } from '@/lib/config'
import { QRCodeSVG } from 'qrcode.react'
import { ManageTablesDialog } from './ManageTablesDialog'
import { TakeOrderDialog } from './TakeOrderDialog'
import { useRef, useState } from 'react'
import { Link } from 'react-router-dom'

const statusLabel: Record<string, string> = {
  [TableStatus.AVAILABLE]: 'ว่าง',
  [TableStatus.OCCUPIED]: 'มีลูกค้า',
  [TableStatus.RESERVED]: 'จองแล้ว',
}

/**
 * สภาพของการ์ดโต๊ะ — ว่าง (ขอบประ) / มีลูกค้า / ขอเช็คบิล / เรียกพนักงาน
 * เรียกพนักงานสำคัญกว่าขอบิล (ลูกค้ารออยู่) จึงชนะเมื่อมีทั้งสองอย่าง
 * แยกด้วยรูปทรงขอบ + ข้อความ + ไอคอนกระดิ่ง ไม่ได้บอกด้วยสีอย่างเดียว
 */
type TileState = 'free' | 'busy' | 'bill' | 'call'

const tileTone: Record<TileState, string> = {
  free: 'border-dashed border-gray-300 bg-staff-ground text-gray-700',
  busy: 'border-brand-100 bg-brand-50 text-text',
  bill: 'border-brand-500 bg-brand-50 text-text',
  call: 'border-status-queue-ink bg-status-queue/10 text-text',
}

const stateText: Record<TileState, [label: string | null, ink: string]> = {
  // null = ใช้สถานะของโต๊ะเอง (ว่าง / มีลูกค้า / จองแล้ว)
  free: [null, 'text-gray-700'],
  busy: [null, 'text-brand-500'],
  bill: ['ขอเช็คบิล', 'text-brand-500'],
  call: ['เรียกพนักงาน', 'text-status-queue-ink'],
}

const requestLabel: Record<string, string> = {
  [ServiceRequestType.CALL_STAFF]: 'เรียกพนักงาน',
  [ServiceRequestType.CHECKOUT]: 'ขอเช็คบิล',
  [ServiceRequestType.OTHER]: 'อื่น ๆ',
}

/** ลิงก์ที่ลูกค้าจะเข้าหลังสแกน — อิง origin ของหน้าที่เปิดอยู่ */
const customerUrl = (token: string) => `${window.location.origin}/t/${token}`

/** "เมื่อสักครู่" / "5 นาทีที่แล้ว" / "1 ชม.ที่แล้ว" — คำขอเก่าแค่ไหนสำคัญกว่าเวลานาฬิกา */
function ago(iso: string) {
  const minutes = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 60_000))
  if (minutes < 1) return 'เมื่อสักครู่'
  if (minutes < 60) return `${minutes} นาทีที่แล้ว`
  return `${Math.floor(minutes / 60)} ชม.ที่แล้ว`
}

export function TablesPage() {
  const user = useAuth((s) => s.user)
  const tablesQuery = useTables()
  const sessionsQuery = useSessions()
  const { data: tables, isPending } = tablesQuery
  const { data: sessions } = sessionsQuery
  const { data: requests } = useServiceRequests()
  const resolve = useResolveServiceRequest()
  const openSession = useOpenSession()
  const closeSession = useCloseSession()
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [qrTarget, setQrTarget] = useState<TableSession | null>(null)
  const [orderTarget, setOrderTarget] = useState<TableSession | null>(null)
  // ปิดโต๊ะย้อนกลับไม่ได้ (QR ใช้ไม่ได้อีก) — ถามก่อนเหมือนหน้า Check
  const [closeTarget, setCloseTarget] = useState<TableSession | null>(null)
  const panelRef = useRef<HTMLElement>(null)

  // เปิดโต๊ะได้เฉพาะ ADMIN/STAFF ตาม @Roles ของ POST /table-sessions
  const canOpen = Boolean(user && pageRoles.openTable.includes(user.role))
  // เพิ่ม/แก้/ปิดใช้งาน/ลบโต๊ะ — ADMIN เท่านั้น (POST/PATCH/DELETE /tables)
  const canManageTables = Boolean(user && pageRoles.manageTables.includes(user.role))
  const [managing, setManaging] = useState(false)

  // บิลกลับบ้านอยู่บนโต๊ะเสมือน ไม่เกี่ยวกับหน้านี้
  const openTableSessions = (sessions ?? []).filter(
    (s) => s.status === TableSessionStatus.OPEN && !s.isTakeaway,
  )
  const openSessionOf = (table: RestaurantTable) =>
    openTableSessions.find((s) => s.tableId === table.id)

  // คำขอที่ยังค้าง เก่าสุดก่อน — ใช้ทั้งระบายการ์ดและกล่องคำขอด้านขวา
  // เฉพาะของบิลโต๊ะที่ยังเปิดอยู่ — คำขอค้างของบิลที่ปิดไปแล้วไม่มีใครต้องไปหา
  const openIds = new Set(openTableSessions.map((s) => s.id))
  const pending = (requests ?? [])
    .filter((r) => r.status === ServiceRequestStatus.PENDING && openIds.has(r.tableSessionId))
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
  const stateOf = (table: RestaurantTable, session: TableSession | undefined): TileState => {
    if (!session) return table.status === TableStatus.AVAILABLE ? 'free' : 'busy'
    const mine = pending.filter((r) => r.tableSessionId === session.id)
    if (mine.some((r) => r.type !== ServiceRequestType.CHECKOUT)) return 'call'
    if (mine.some((r) => r.type === ServiceRequestType.CHECKOUT)) return 'bill'
    return 'busy'
  }

  const tiles = (tables ?? []).map((table) => {
    const session = openSessionOf(table)
    return { table, session, state: stateOf(table, session) }
  })
  const count = (state: TileState) => tiles.filter((t) => t.state === state).length
  const selected = tiles.find((t) => t.table.id === selectedId)

  const select = (id: string) => {
    setSelectedId(id)
    // จอแคบกล่องรายละเอียดอยู่ใต้ผังโต๊ะ — เลื่อนลงไปให้เห็นปุ่มทันที
    if (!window.matchMedia?.('(min-width: 1024px)').matches) {
      panelRef.current?.scrollIntoView?.({ behavior: 'smooth', block: 'start' })
    }
  }

  return (
    <div className="mx-auto max-w-7xl">
      {/* โหลดไม่ขึ้นต้องบอก — ไม่งั้นโต๊ะที่เปิดอยู่จะดูเหมือน "ว่าง" แล้วเผลอเปิดซ้ำ */}
      {tablesQuery.isError && (
        <LoadError
          what="รายการโต๊ะ"
          stale={Boolean(tables)}
          error={tablesQuery.error}
          onRetry={() => tablesQuery.refetch()}
        />
      )}
      {sessionsQuery.isError && (
        <LoadError
          what="โต๊ะที่เปิดอยู่"
          stale={Boolean(sessions)}
          error={sessionsQuery.error}
          onRetry={() => sessionsQuery.refetch()}
        />
      )}
      <ErrorNote error={openSession.error} />

      {/* หัวข้อหน้า "โต๊ะ" อยู่บน header ของ layout แล้ว — ตรงนี้เป็นสรุปสถานะทั้งร้าน */}
      <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
        <ul aria-label="สรุปสถานะโต๊ะ" className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <Legend swatch="border-dashed border-gray-400 bg-staff-ground" label="ว่าง" n={count('free')} />
          <Legend swatch="border-brand-100 bg-brand-50" label="มีลูกค้า" n={count('busy')} />
          <Legend swatch="border-brand-500 bg-brand-50" label="ขอเช็คบิล" n={count('bill')} />
          <Legend swatch="border-status-queue-ink bg-status-queue/10" label="เรียกพนักงาน" n={count('call')} />
        </ul>
        {canManageTables && (
          <button type="button" onClick={() => setManaging(true)} className={`ml-auto shrink-0 ${button('outline', 'md')}`}>
            จัดการโต๊ะ
          </button>
        )}
      </div>

      {managing && <ManageTablesDialog onClose={() => setManaging(false)} />}

      {isPending && <p className="mt-4 text-sm text-gray-600">กำลังโหลด...</p>}

      <div className="mt-4 flex flex-wrap items-start gap-5">
        {/* ผังโต๊ะ — การ์ดเป็นปุ่มเลือกโต๊ะ ปุ่มทำงานจริงอยู่ในกล่องรายละเอียดด้านขวา */}
        <section aria-label="ผังโต๊ะ" className="grid min-w-0 flex-[999_1_560px] grid-cols-2 gap-3.5 sm:grid-cols-3 xl:grid-cols-4">
          {tiles.map(({ table, session, state }) => {
            const [label, ink] = stateText[state]
            const isSelected = table.id === selectedId
            return (
              <button
                key={table.id}
                type="button"
                aria-pressed={isSelected}
                onClick={() => select(table.id)}
                className={`relative flex min-h-33 flex-col items-start justify-between rounded-2xl border-2 p-3.5 text-left transition hover:brightness-[0.98] ${tileTone[state]} ${
                  isSelected ? 'ring-4 ring-brand-75' : ''
                }`}
              >
                <span className="text-3xl font-bold leading-none tabular-nums">
                  <span className="sr-only">โต๊ะ </span>
                  {table.name}
                </span>
                <span className="flex flex-col gap-0.5">
                  <span className={`text-[15px] font-bold ${ink}`}>{label ?? statusLabel[table.status]}</span>
                  <span className="text-[13px] font-semibold text-gray-700 tabular-nums">
                    {session
                      ? `เปิด ${formatTime(session.openedAt)} · ${formatBaht(session.total)}`
                      : 'แตะเพื่อเปิดโต๊ะ'}
                  </span>
                </span>
                {state === 'call' && (
                  <span
                    aria-hidden
                    className="absolute top-3 right-3 flex h-9 w-9 items-center justify-center rounded-full bg-status-queue-ink text-white"
                  >
                    <BellIcon />
                  </span>
                )}
              </button>
            )
          })}
        </section>

        <aside className="flex w-full flex-col gap-3.5 lg:w-95 lg:shrink-0">
          <RequestsInbox
            requests={pending}
            resolvingId={resolve.isPending ? (resolve.variables ?? null) : null}
            onResolve={(id) => resolve.mutate(id)}
          />

          <section
            ref={panelRef}
            aria-label={selected ? `โต๊ะ ${selected.table.name}` : 'รายละเอียดโต๊ะ'}
            className={`flex scroll-mt-24 flex-col gap-3 rounded-2xl border-2 bg-white p-4 ${
              selected ? 'border-brand-500' : 'border-staff-line'
            }`}
          >
            {!selected ? (
              <p className="py-6 text-center text-sm font-semibold text-gray-600">
                แตะโต๊ะในผังเพื่อเปิดโต๊ะ ดู QR หรือรับออเดอร์
              </p>
            ) : (
              <>
                <div className="flex items-baseline gap-2.5">
                  <h2 className="text-2xl font-bold text-text">โต๊ะ {selected.table.name}</h2>
                  <span className="text-sm font-semibold text-gray-700">
                    {statusLabel[selected.table.status]}
                    {selected.session && ` · เปิด ${formatTime(selected.session.openedAt)}`}
                  </span>
                </div>

                {selected.session ? (
                  <>
                    <div className="flex items-baseline justify-between rounded-xl bg-staff-ground px-3 py-2">
                      <span className="text-sm font-bold text-gray-700">ยอดค้างชำระ</span>
                      <span className="text-2xl font-bold text-price tabular-nums">
                        {formatBaht(selected.session.total)}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setOrderTarget(selected.session ?? null)}
                      className={`w-full ${button('primary', 'lg')} min-h-14 text-lg`}
                    >
                      รับออเดอร์แทนลูกค้า
                    </button>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => setQrTarget(selected.session ?? null)}
                        className={`gap-1.5 ${button('outline', 'md')}`}
                      >
                        <QrIcon />
                        ดู QR
                      </button>
                      <button
                        type="button"
                        disabled={closeSession.isPending}
                        onClick={() => setCloseTarget(selected.session ?? null)}
                        className={`${button('danger-outline', 'md')} disabled:opacity-60`}
                      >
                        ปิดโต๊ะ
                      </button>
                    </div>
                  </>
                ) : (
                  <>
                    <button
                      type="button"
                      disabled={!canOpen || openSession.isPending}
                      title={canOpen ? undefined : 'ต้องเป็น ADMIN หรือ STAFF'}
                      onClick={() =>
                        openSession.mutate(selected.table.id, {
                          // เปิดโต๊ะเสร็จเด้ง QR ขึ้นมาเลย จะได้กดพิมพ์ต่อได้ทันที
                          onSuccess: (session) => setQrTarget(session),
                        })
                      }
                      className={`w-full gap-2.5 ${button('primary', 'lg')} min-h-15 text-lg disabled:cursor-not-allowed disabled:bg-gray-200 disabled:text-gray-600`}
                    >
                      <QrIcon />
                      เปิดโต๊ะ/สร้าง QR
                    </button>
                    <p className="text-[13px] text-gray-700">
                      ลูกค้าสแกน QR สั่งเองได้ทันที ไม่ต้อง login · QR หมดอายุเมื่อปิดโต๊ะ
                    </p>
                  </>
                )}
              </>
            )}
          </section>
        </aside>
      </div>

      {qrTarget && (
        <QrDialog session={qrTarget} onClose={() => setQrTarget(null)} />
      )}

      {closeTarget && (
        <ConfirmDialog
          title="ปิดโต๊ะ"
          subject={`โต๊ะ ${closeTarget.tableName}`}
          consequence="QR ของโต๊ะนี้จะใช้สั่งอาหารไม่ได้อีก — ถ้ายังมียอดค้างชำระระบบจะไม่ยอมปิด ให้เก็บเงินที่หน้า Check ก่อน"
          confirmLabel="ปิดโต๊ะ"
          pendingLabel="กำลังปิด..."
          tone="brand"
          isPending={closeSession.isPending}
          error={closeSession.error}
          onCancel={() => {
            closeSession.reset()
            setCloseTarget(null)
          }}
          onConfirm={() =>
            closeSession.mutate(closeTarget.id, {
              onSuccess: () => setCloseTarget(null),
            })
          }
        />
      )}

      {orderTarget && (
        <TakeOrderDialog
          session={orderTarget}
          onClose={() => setOrderTarget(null)}
        />
      )}
    </div>
  )
}

/**
 * คำขอที่ค้างจากโต๊ะ — ขอเช็คบิลไปจบที่หน้ารับเงิน (เก็บเงินแล้วคำขอปิดเอง)
 * ส่วนเรียกพนักงาน/อื่น ๆ กดรับทราบได้ที่นี่เลย
 */
function RequestsInbox({
  requests,
  resolvingId,
  onResolve,
}: Readonly<{
  requests: ServiceRequest[]
  resolvingId: string | null
  onResolve: (id: string) => void
}>) {
  return (
    <section aria-labelledby="table-requests" className="flex flex-col gap-2.5 rounded-2xl border-2 border-staff-line bg-white p-4">
      <h2 id="table-requests" className="text-lg font-bold text-text">
        คำขอจากโต๊ะ{' '}
        {requests.length > 0 && <span className="text-status-queue-ink tabular-nums">({requests.length})</span>}
      </h2>
      {requests.length === 0 && <p className="text-sm font-semibold text-gray-600">ไม่มีคำขอค้าง</p>}
      {requests.map((req) => {
        const checkout = req.type === ServiceRequestType.CHECKOUT
        const call = req.type === ServiceRequestType.CALL_STAFF
        return (
          <div
            key={req.id}
            className={`flex items-center gap-3 rounded-xl border-2 bg-white p-3 ${
              call ? 'border-status-queue/40' : checkout ? 'border-brand-100' : 'border-staff-line'
            }`}
          >
            <div className="min-w-0 flex-1">
              <p className="text-base font-bold text-text">
                โต๊ะ {req.tableName} ·{' '}
                <span className={call ? 'text-status-queue-ink' : checkout ? 'text-brand-500' : 'text-gray-800'}>
                  {requestLabel[req.type]}
                </span>
              </p>
              <p className="truncate text-[13px] font-semibold text-gray-700">
                {req.note ? `“${req.note}”` : ago(req.createdAt)}
              </p>
            </div>
            {checkout ? (
              <Link to="/employee/check" className={`shrink-0 ${button('primary', 'sm')}`}>
                ไปที่บิล
              </Link>
            ) : (
              <button
                type="button"
                disabled={resolvingId === req.id}
                onClick={() => onResolve(req.id)}
                className={`shrink-0 ${button('primary', 'sm')} disabled:opacity-60`}
              >
                รับทราบ
              </button>
            )}
          </div>
        )
      })}
    </section>
  )
}

function Legend({ swatch, label, n }: Readonly<{ swatch: string; label: string; n: number }>) {
  return (
    <li className="flex items-center gap-1.5 text-sm font-semibold text-gray-700">
      <span aria-hidden className={`h-4 w-4 rounded border-2 ${swatch}`} />
      {label}
      <span className="font-bold text-text tabular-nums">{n}</span>
    </li>
  )
}

function QrIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" aria-hidden className="h-5 w-5 shrink-0">
      <path d="M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h2v2h-2zM18 18h2v2h-2z" />
    </svg>
  )
}

function BellIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden className="h-4.5 w-4.5">
      <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" strokeLinejoin="round" />
      <path d="M10.3 21a1.9 1.9 0 0 0 3.4 0" />
    </svg>
  )
}

function QrDialog({
  session,
  onClose,
}: Readonly<{
  session: TableSession
  onClose: () => void
}>) {
  const [copied, setCopied] = useState(false)
  const url = customerUrl(session.token)

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // บาง browser บล็อก clipboard ถ้าไม่ได้เปิดผ่าน https
      // ผู้ใช้ยังก๊อปเองได้จากช่องข้อความด้านล่าง
      setCopied(false)
    }
  }

  return (
    <Modal title={`QR โต๊ะ ${session.tableName}`} onClose={onClose}>
      <div className="flex flex-col items-center">
        {/* .print-area = ส่วนเดียวที่จะติดไปกับกระดาษ (ดู @media print ใน index.css) */}
        <div className="print-area flex flex-col items-center rounded-xl border border-gray-200 p-4">
          <div className="hidden text-center print:block">
            <p className="text-2xl font-bold text-black">{RESTAURANT_NAME}</p>
            <p className="mt-1 text-4xl font-bold text-black">
              โต๊ะ {session.tableName}
            </p>
          </div>

          <QRCodeSVG value={url} size={220} className="print:h-80 print:w-80" />

          <p className="hidden text-center text-lg font-semibold text-black print:block">
            สแกนเพื่อดูเมนูและสั่งอาหาร
          </p>
        </div>

        <p className="mt-3 text-sm text-gray-600 print:hidden">
          ให้ลูกค้าสแกนเพื่อสั่งอาหารที่โต๊ะนี้
        </p>

        <input
          readOnly
          value={url}
          onFocus={(e) => e.target.select()}
          className="mt-3 w-full rounded border border-gray-300 bg-gray-100 px-3 py-2 text-center text-xs text-gray-700 print:hidden"
        />

        <div className="mt-4 grid w-full grid-cols-2 gap-3 print:hidden">
          <button
            type="button"
            onClick={copy}
            className={button('outline', 'md')}
          >
            {copied ? 'คัดลอกแล้ว' : 'คัดลอกลิงก์'}
          </button>
          <button
            type="button"
            onClick={() => window.print()}
            className={button('primary', 'md')}
          >
            พิมพ์
          </button>
        </div>
      </div>
    </Modal>
  )
}
