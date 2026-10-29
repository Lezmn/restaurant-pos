import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { ErrorNote } from '@/components/ui/ErrorNote'
import { LoadError } from '@/components/ui/LoadError'
import { Modal } from '@/components/ui/Modal'
import { button } from '@/components/ui/styles'
import { pageRoles } from '@/features/auth/permissions'
import { useAuth } from '@/features/auth/use-auth'
import { useServiceRequests } from '@/features/service-requests/hooks'
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
import type { RestaurantTable, TableSession } from '@/types/models'
import { RESTAURANT_NAME } from '@/lib/config'
import { QRCodeSVG } from 'qrcode.react'
import { ManageTablesDialog } from './ManageTablesDialog'
import { TakeOrderDialog } from './TakeOrderDialog'
import { useState } from 'react'

const statusLabel: Record<string, string> = {
  [TableStatus.AVAILABLE]: 'ว่าง',
  [TableStatus.OCCUPIED]: 'มีลูกค้า',
  [TableStatus.RESERVED]: 'จองแล้ว',
}

/**
 * สภาพของการ์ดโต๊ะ — ว่าง (ขอบประ) / มีลูกค้า / ขอเช็คบิล / เรียกพนักงาน
 * เรียกพนักงานสำคัญกว่าขอบิล (ลูกค้ารออยู่) จึงชนะเมื่อมีทั้งสองอย่าง
 * แยกด้วยรูปทรงขอบ + ป้ายข้อความ ไม่ได้บอกด้วยสีอย่างเดียว
 */
type TileState = 'free' | 'busy' | 'bill' | 'call'

const tileTone: Record<TileState, string> = {
  free: 'border-dashed border-gray-300 bg-staff-ground',
  busy: 'border-brand-100 bg-white',
  bill: 'border-brand-500 bg-brand-50',
  call: 'border-status-queue-ink bg-status-queue/5',
}

const stateInk: Record<TileState, string> = {
  free: 'text-gray-700',
  busy: 'text-brand-500',
  bill: 'text-brand-500',
  call: 'text-status-queue-ink',
}

/** ลิงก์ที่ลูกค้าจะเข้าหลังสแกน — อิง origin ของหน้าที่เปิดอยู่ */
const customerUrl = (token: string) => `${window.location.origin}/t/${token}`

export function TablesPage() {
  const user = useAuth((s) => s.user)
  const tablesQuery = useTables()
  const sessionsQuery = useSessions()
  const { data: tables, isPending } = tablesQuery
  const { data: sessions } = sessionsQuery
  const { data: requests } = useServiceRequests()
  const openSession = useOpenSession()
  const closeSession = useCloseSession()
  const [qrTarget, setQrTarget] = useState<TableSession | null>(null)
  const [orderTarget, setOrderTarget] = useState<TableSession | null>(null)
  // ปิดโต๊ะย้อนกลับไม่ได้ (QR ใช้ไม่ได้อีก) — ถามก่อนเหมือนหน้า Check
  const [closeTarget, setCloseTarget] = useState<TableSession | null>(null)

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

  // คำขอที่ยังค้างของแต่ละบิล — ใช้ระบายการ์ด (ตัวรับเรื่องจริงยังเป็นป๊อปอัปเรียกพนักงาน / หน้า Check)
  const pending = (requests ?? []).filter((r) => r.status === ServiceRequestStatus.PENDING)
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
          <Legend swatch="border-brand-100 bg-white" label="มีลูกค้า" n={count('busy')} />
          <Legend swatch="border-brand-500 bg-brand-50" label="ขอเช็คบิล" n={count('bill')} />
          <Legend swatch="border-status-queue-ink bg-status-queue/10" label="เรียกพนักงาน" n={count('call')} />
        </ul>
        {canManageTables && (
          <button type="button" onClick={() => setManaging(true)} className={`ml-auto shrink-0 ${button('outline', 'md')}`}>
            จัดการโต๊ะ
          </button>
        )}
      </div>
      <p className="mt-2 text-sm text-gray-600">
        เปิดโต๊ะเพื่อพิมพ์ QR ให้ลูกค้าสแกนสั่งเอง · ปิดโต๊ะเมื่อลูกค้ากลับและจ่ายครบแล้ว
      </p>

      {managing && <ManageTablesDialog onClose={() => setManaging(false)} />}

      {isPending && <p className="mt-4 text-sm text-gray-600">กำลังโหลด...</p>}

      <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {tiles.map(({ table, session, state }) => (
          <article
            key={table.id}
            // min-w-0: ชื่อโต๊ะยาวไม่ดันการ์ดจนล้นจอมือถือ
            className={`flex min-w-0 flex-col gap-3 rounded-2xl border-2 p-4 ${tileTone[state]}`}
          >
            <div className="flex items-start justify-between gap-2">
              {/* p.text-xl = หัวการ์ดที่ E2E ใช้หาโต๊ะแบบตรงตัว (helpers.tablesPageCard) */}
              <p className="text-xl font-bold leading-tight text-text sm:text-2xl">โต๊ะ {table.name}</p>
              {state === 'call' && (
                <span className="flex shrink-0 items-center gap-1 rounded-full bg-status-queue-ink px-2.5 py-1 text-xs font-bold text-white">
                  <BellIcon />
                  เรียกพนักงาน
                </span>
              )}
              {state === 'bill' && (
                <span className="shrink-0 rounded-full bg-brand-500 px-2.5 py-1 text-xs font-bold text-white">
                  ขอเช็คบิล
                </span>
              )}
            </div>

            <div>
              <span className={`text-base font-bold ${stateInk[state]}`}>{statusLabel[table.status]}</span>
              {session && (
                <p className="text-sm font-semibold text-gray-700 tabular-nums">
                  เปิด {formatTime(session.openedAt)} · {formatBaht(session.total)}
                </p>
              )}
            </div>

            {session ? (
              <div className="mt-auto flex flex-col gap-2">
                <button
                  type="button"
                  onClick={() => setOrderTarget(session)}
                  className={`w-full ${button('primary', 'md')}`}
                >
                  รับออเดอร์แทนลูกค้า
                </button>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setQrTarget(session)}
                    className={`gap-1.5 ${button('outline', 'sm')}`}
                  >
                    <QrIcon />
                    ดู QR
                  </button>
                  <button
                    type="button"
                    disabled={closeSession.isPending}
                    onClick={() => setCloseTarget(session)}
                    className={`${button('danger-outline', 'sm')} disabled:opacity-60`}
                  >
                    ปิดโต๊ะ
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                disabled={!canOpen || openSession.isPending}
                title={canOpen ? undefined : 'ต้องเป็น ADMIN หรือ STAFF'}
                onClick={() =>
                  openSession.mutate(table.id, {
                    // เปิดโต๊ะเสร็จเด้ง QR ขึ้นมาเลย จะได้กดพิมพ์ต่อได้ทันที
                    onSuccess: (session) => setQrTarget(session),
                  })
                }
                className={`mt-auto w-full gap-2 ${button('primary', 'lg')} disabled:cursor-not-allowed disabled:bg-gray-200 disabled:text-gray-600`}
              >
                <QrIcon />
                เปิดโต๊ะ/สร้าง QR
              </button>
            )}
          </article>
        ))}
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
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden className="h-3.5 w-3.5">
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
