import { Badge, type BadgeTone } from '@/components/ui/Badge'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { ErrorNote } from '@/components/ui/ErrorNote'
import { Modal } from '@/components/ui/Modal'
import { button } from '@/components/ui/styles'
import { pageRoles } from '@/features/auth/permissions'
import { useAuth } from '@/features/auth/use-auth'
import {
  useCloseSession,
  useOpenSession,
  useSessions,
  useSetGuestCount,
} from '@/features/table-sessions/hooks'
import { useTables } from '@/features/tables/hooks'
import { TableSessionStatus, TableStatus } from '@/types/enums'
import type { RestaurantTable, TableSession } from '@/types/models'
import { RESTAURANT_NAME } from '@/lib/config'
import { QRCodeSVG } from 'qrcode.react'
import { ManageTablesDialog } from './ManageTablesDialog'
import { TakeOrderDialog } from './TakeOrderDialog'
import { useState } from 'react'

const statusTone: Record<string, BadgeTone> = {
  [TableStatus.AVAILABLE]: 'green',
  [TableStatus.OCCUPIED]: 'amber',
  [TableStatus.RESERVED]: 'blue',
}

const statusLabel: Record<string, string> = {
  [TableStatus.AVAILABLE]: 'ว่าง',
  [TableStatus.OCCUPIED]: 'มีลูกค้า',
  [TableStatus.RESERVED]: 'จองแล้ว',
}

/** ลิงก์ที่ลูกค้าจะเข้าหลังสแกน — อิง origin ของหน้าที่เปิดอยู่ */
const customerUrl = (token: string) => `${window.location.origin}/t/${token}`

export function TablesPage() {
  const user = useAuth((s) => s.user)
  const { data: tables, isPending } = useTables()
  const { data: sessions } = useSessions()
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

  const openSessionOf = (table: RestaurantTable) =>
    sessions?.find(
      (s) => s.tableId === table.id && s.status === TableSessionStatus.OPEN,
    )

  return (
    <div>
      <ErrorNote error={openSession.error} />

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-gray-600">
          เปิดโต๊ะเพื่อสร้าง QR ให้ลูกค้าสแกนสั่งอาหาร · ปิดโต๊ะเมื่อลูกค้ากลับแล้ว
        </p>
        {canManageTables && (
          <button type="button" onClick={() => setManaging(true)} className={button('outline', 'md')}>
            จัดการโต๊ะ
          </button>
        )}
      </div>

      {managing && <ManageTablesDialog onClose={() => setManaging(false)} />}

      {isPending && <p className="text-sm text-gray-500">กำลังโหลด...</p>}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {tables?.map((table) => {
          const session = openSessionOf(table)

          return (
            <article
              key={table.id}
              className="rounded-xl border-2 border-brand-75 bg-white p-4"
            >
              <div className="flex items-center justify-between">
                <p className="text-xl font-bold text-black">โต๊ะ {table.name}</p>
                <Badge tone={statusTone[table.status]}>
                  {statusLabel[table.status]}
                </Badge>
              </div>
              <p className="mt-1 text-sm text-gray-500">{table.seats} ที่นั่ง</p>

              {session ? (
                <>
                  <button
                    type="button"
                    onClick={() => setQrTarget(session)}
                    title="กดเพื่อดู QR ขนาดใหญ่"
                    className="mt-3 flex w-full cursor-pointer justify-center rounded-lg border border-gray-200 bg-white p-3 transition hover:border-brand-300"
                  >
                    <QRCodeSVG value={customerUrl(session.token)} size={120} />
                  </button>

                  <p className="mt-2 truncate text-center text-xs text-gray-400">
                    {session.token}
                  </p>

                  <button
                    type="button"
                    onClick={() => setOrderTarget(session)}
                    className="mt-3 w-full rounded-lg bg-brand-300 py-2 text-sm font-bold text-white transition hover:bg-brand-400"
                  >
                    รับออเดอร์แทนลูกค้า
                  </button>

                  <button
                    type="button"
                    disabled={closeSession.isPending}
                    onClick={() => setCloseTarget(session)}
                    className="mt-2 w-full rounded-lg border-2 border-danger py-2 text-sm font-bold text-danger transition hover:bg-danger/10 disabled:opacity-60"
                  >
                    ปิดโต๊ะ
                  </button>
                </>
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
                  className="mt-4 w-full rounded-lg bg-brand-300 py-2.5 text-sm font-bold text-white transition hover:bg-brand-400 disabled:cursor-not-allowed disabled:bg-gray-300"
                >
                  เปิดโต๊ะ + สร้าง QR
                </button>
              )}
            </article>
          )
        })}
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

        <GuestCountPicker session={session} />

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
            className="rounded-lg border-2 border-brand-300 py-2.5 text-sm font-bold text-brand-400 transition hover:bg-brand-50"
          >
            {copied ? 'คัดลอกแล้ว' : 'คัดลอกลิงก์'}
          </button>
          <button
            type="button"
            onClick={() => window.print()}
            className="rounded-lg bg-brand-300 py-2.5 text-sm font-bold text-white transition hover:bg-brand-400"
          >
            พิมพ์
          </button>
        </div>
      </div>
    </Modal>
  )
}

const GUEST_CHOICES = [1, 2, 3, 4, 5, 6, 7, 8] as const

/**
 * จำนวนลูกค้าของโต๊ะ — ไม่บังคับ ไม่ขวางการเปิดโต๊ะ กดแล้วบันทึกทันที แก้ได้จนกว่าจะปิดบิล
 * Dashboard รวมเป็น "ลูกค้าเข้าใช้บริการ" (โต๊ะที่ไม่ได้กดจะนับแยกเป็น "ไม่ได้ระบุ")
 */
function GuestCountPicker({ session }: Readonly<{ session: TableSession }>) {
  const setGuests = useSetGuestCount()
  const [picked, setPicked] = useState<number | null>(session.guestCount)

  const pick = (count: number) => {
    setPicked(count)
    setGuests.mutate({ sessionId: session.id, guestCount: count })
  }

  return (
    <fieldset className="mt-4 w-full print:hidden">
      <legend className="text-sm font-semibold text-gray-700">
        จำนวนลูกค้า <span className="font-normal text-gray-600">(ไม่บังคับ — ใช้ในสรุปของเจ้าของร้าน)</span>
      </legend>
      <div className="mt-2 grid grid-cols-8 gap-1.5">
        {GUEST_CHOICES.map((n) => (
          <button
            key={n}
            type="button"
            aria-pressed={picked === n}
            disabled={setGuests.isPending}
            onClick={() => pick(n)}
            className={`min-h-11 rounded-lg border-2 text-base font-bold tabular-nums transition ${
              picked === n
                ? 'border-brand-400 bg-brand-50 text-brand-500'
                : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50'
            }`}
          >
            {n === GUEST_CHOICES.length ? `${n}+` : n}
          </button>
        ))}
      </div>
      {setGuests.isError ? (
        <p role="alert" className="mt-1 text-sm font-semibold text-danger-ink">
          บันทึกจำนวนลูกค้าไม่สำเร็จ — กดใหม่อีกครั้ง
        </p>
      ) : (
        picked !== null &&
        !setGuests.isPending && (
          <p className="mt-1 text-sm text-gray-600">บันทึกแล้ว {picked} คน</p>
        )
      )}
    </fieldset>
  )
}
