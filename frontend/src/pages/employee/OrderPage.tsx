import {
  useClearOrder,
  useOrders,
  useUpdateOrderStatus,
} from '@/features/orders/hooks'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { ErrorNote } from '@/components/ui/ErrorNote'
import { LoadError } from '@/components/ui/LoadError'
import { installAudioUnlock, playAlert, useAlertSound } from '@/lib/alert-sound'
import { isAllergyNote } from '@/lib/item-note'
import { LIVE_POLL_MS } from '@/lib/live'
import { useNewArrivals } from '@/lib/use-new-arrivals'
import { useWakeLock } from '@/lib/use-wake-lock'
import { OrderStatus } from '@/types/enums'
import type { Order, OrderItem } from '@/types/models'
import { useEffect, useRef, useState } from 'react'
import { KitchenSoldOutButton } from './KitchenSoldOut'

// socket สั่ง refetch ให้อยู่แล้ว — poll นี้เป็นตัวสำรองตอน socket หลุด
const POLL_MS = LIVE_POLL_MS

// ปัดลง (นาทีเต็ม) — ปัดเศษทำให้ 30 วิแรกขึ้น "รอ 1 นาที" และป้าย "ใหม่" หายเร็วกว่าที่ตั้งใจ
const waitedMinutes = (iso: string) =>
  Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 60_000))

/** กด "ทำเสร็จแล้ว" แล้วรอเท่านี้ก่อนส่งจริง ระหว่างนั้นกด "ยกเลิก" บนตั๋วได้
 *  backend ห้ามย้อน SERVED → PREPARING จึงต้องหน่วงไว้ฝั่งนี้ ไม่ใช่ส่งแล้วค่อยย้อน */
const UNDO_MS = 5000

type ColumnKey = 'queue' | 'cooking' | 'done'

/**
 * หนึ่งรายการอาหารในการ์ดออเดอร์ — แยกออกมาจาก JSX ของหน้า
 * เพราะเดิมซ้อนกันถึง 6 ชั้น (map > map > JSX > onChange > setState updater) อ่านยาก
 * และทำให้ทั้งคอลัมน์ re-render ใหม่ทุกครั้งที่ติ๊กช่องเดียว
 */
function KitchenItemRow({
  item,
  columnKey,
  checked,
  onToggle,
}: Readonly<{
  item: OrderItem
  columnKey: ColumnKey
  checked: boolean
  onToggle: (checked: boolean) => void
}>) {
  return (
    <li
      className={`rounded-lg border border-gray-200 px-3 py-2 ${
        columnKey === 'done' ? 'text-gray-500' : 'text-black'
      }`}
    >
      {/* คอลัมน์กำลังปรุง: ทั้งแถวเป็น label แตะตรงไหนก็ติ๊กได้
          จอครัวบน iPad มือเปียก/ใส่ถุงมือ เล็ง checkbox 20px ไม่ไหว */}
      <label
        className={`flex min-h-10 items-center justify-between gap-3 ${
          columnKey === 'cooking' ? 'cursor-pointer' : ''
        }`}
      >
        {/* ครัวอ่านจากระยะแขน — 16px ขึ้นไป จำนวนตัวใหญ่ให้เห็นก่อนชื่อ */}
        <span className={`text-base leading-snug ${checked ? 'text-gray-500 line-through' : ''}`}>
          <span className="mr-1 text-lg font-bold tabular-nums">{item.quantity}×</span>
          <span className="font-semibold">{item.menuItemName}</span>
          {/* ตัวเลือก (หมู/ไข่ดาว) ทำผิดแล้วต้องทำใหม่ — ตัวเท่าชื่อเมนู สีเข้ม ไม่ใช่ตัวเล็กสีเทา */}
          {item.optionNames.length > 0 && (
            <span className={`block text-base font-semibold ${checked ? '' : 'text-brand-500'}`}>
              {item.optionNames.join(' · ')}
            </span>
          )}
        </span>

        {columnKey === 'cooking' && (
          <input
            type="checkbox"
            aria-label={`ทำ ${item.menuItemName} แล้ว`}
            checked={checked}
            onChange={(e) => onToggle(e.target.checked)}
            className="h-6 w-6 shrink-0 accent-status-cooking"
          />
        )}
      </label>

      {/* แพ้อาหาร = พื้นแดงตัวขาว + ไอคอน (ไม่ได้บอกด้วยสีอย่างเดียว) — ทำพลาดแล้วลูกค้าอันตราย
          โน้ตทั่วไป (ไม่เผ็ด ฯลฯ) = กล่องเหลือง */}
      {item.note &&
        columnKey !== 'done' &&
        (isAllergyNote(item.note) ? (
          <p className="mt-1.5 flex items-start gap-1.5 rounded-md bg-danger-ink px-2 py-1 text-base font-bold text-white">
            <AlertIcon />
            <span>
              <span className="sr-only">ระวัง แพ้อาหาร: </span>
              {item.note}
            </span>
          </p>
        ) : (
          // โน้ตทั่วไป (ไม่เผ็ด / ไม่ใส่ผัก) = กล่องเหลืองมีป้าย "หมายเหตุ" — เด่นกว่าตัวเลือก แต่ไม่แรงเท่าแพ้อาหาร
          <p className="mt-1.5 rounded-md border-l-4 border-amber-500 bg-amber-100 px-2 py-1 text-base font-bold text-amber-900">
            <span className="mr-1.5 rounded bg-amber-700 px-1.5 py-0.5 text-xs font-bold text-white">หมายเหตุ</span>
            {item.note}
          </p>
        ))}
    </li>
  )
}

const columns: {
  key: ColumnKey
  title: string
  status: OrderStatus
  dot: string
  border: string
  badge: string
  button: string
  buttonLabel: string
}[] = [
  {
    key: 'queue',
    title: 'รอคิว',
    status: OrderStatus.PENDING,
    dot: 'bg-status-queue',
    border: 'border-status-queue',
    badge: 'bg-status-queue/15 text-status-queue-ink',
    // พื้นปุ่มตัวขาวใช้ -ink — สีสถานะปกติคอนทราสต์ไม่ถึง 4.5:1
    button: 'bg-status-queue-ink',
    buttonLabel: 'เริ่มปรุง',
  },
  {
    key: 'cooking',
    title: 'กำลังปรุง',
    status: OrderStatus.PREPARING,
    dot: 'bg-status-cooking',
    border: 'border-status-cooking',
    badge: 'bg-status-cooking/15 text-status-cooking-ink',
    button: 'bg-status-cooking-ink',
    buttonLabel: 'ทำเสร็จแล้ว',
  },
  {
    key: 'done',
    title: 'เสร็จแล้ว',
    status: OrderStatus.SERVED,
    dot: 'bg-status-done',
    border: 'border-status-done',
    badge: 'bg-status-done/15 text-status-done-ink',
    button: 'bg-status-done-ink',
    // กดแล้วตั๋วหายจากบอร์ด — ชื่อปุ่มบอกตรง ๆ ไม่ซ้ำกับ "ทำเสร็จแล้ว" ของคอลัมน์ก่อนหน้า
    buttonLabel: 'เสิร์ฟแล้ว · เอาออก',
  },
]

/**
 * แถบบนจอครัว: เสียงแจ้งเตือนออเดอร์ใหม่ (เปิด/ปิดต่อเครื่อง) + สถานะกันจอดับ
 * แท็บเล็ตไม่ยอมเล่นเสียงจนกว่าจะแตะจอ 1 ครั้ง — แตะตรงไหนก็ได้ installAudioUnlock เปิดให้เอง
 * (เลิกมีปุ่ม "แตะเพื่อเปิดเสียง" — ครัวต้องแตะจอกดตั๋วอยู่แล้ว)
 */
function KitchenAlertBar({ screenAwake }: Readonly<{ screenAwake: boolean }>) {
  const { enabled, setEnabled } = useAlertSound()

  return (
    <div className="mb-4 flex flex-wrap items-center justify-end gap-x-4 gap-y-2">
      {/* ของหมดกดได้จากจอครัวเลย ไม่ต้องสลับไปหน้า Manage */}
      <div className="mr-auto">
        <KitchenSoldOutButton />
      </div>
      {screenAwake && <span className="text-sm text-gray-600">หน้าจอเปิดค้างไว้ระหว่างอยู่หน้านี้</span>}
      <button
        type="button"
        aria-pressed={enabled}
        aria-label={enabled ? 'เสียงแจ้งเตือนเปิดอยู่ (แตะเพื่อปิด)' : 'เสียงแจ้งเตือนปิดอยู่ (แตะเพื่อเปิด)'}
        title={enabled ? 'ปิดเสียงแจ้งเตือน' : 'เปิดเสียงแจ้งเตือน'}
        onClick={() => setEnabled(!enabled)}
        className={`flex h-11 w-11 items-center justify-center rounded-lg border-2 transition ${
          enabled
            ? 'border-green-500 bg-green-50 text-green-700 hover:bg-green-100'
            : 'border-gray-300 bg-gray-100 text-gray-500 hover:bg-gray-200'
        }`}
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
          className="h-6 w-6"
        >
          <path d="M11 5 6 9H2v6h4l5 4V5Z" />
          {enabled ? (
            <path d="M15.5 8.5a5 5 0 0 1 0 7M19 5a10 10 0 0 1 0 14" />
          ) : (
            <path d="m22 9-6 6M16 9l6 6" />
          )}
        </svg>
      </button>
    </div>
  )
}

/** รอเกินนี้ (นาที) ตัวเลขเวลารอเปลี่ยนเป็นสีแดง — ครัวเห็นว่าตั๋วไหนค้างนาน */
const LATE_MINUTES = 15

/** โครงตั๋วระหว่างโหลดครั้งแรก — ให้รูปทรงเหมือนบอร์ดจริง ไม่ใช่ข้อความลอย ๆ */
function BoardSkeleton() {
  return (
    <div aria-hidden className="grid gap-4 md:grid-cols-3 md:divide-x md:divide-gray-200">
      {columns.map((column) => (
        <div key={column.key} className="space-y-4 md:px-3">
          <div className="h-7 w-32 animate-pulse rounded bg-gray-200" />
          <div className="h-44 animate-pulse rounded-xl bg-gray-100" />
        </div>
      ))}
    </div>
  )
}

export function OrderPage() {
  const ordersQuery = useOrders({ refetchInterval: POLL_MS })
  const { data: orders, isPending } = ordersQuery
  // โหลดไม่ได้และไม่มีข้อมูลรอบก่อน = ไม่รู้ว่ามีออเดอร์หรือไม่ ห้ามขึ้น "ไม่มีรายการ"
  // (เดิมเน็ตหลุดแล้วทั้ง 3 คอลัมน์ว่าง ครัวเข้าใจว่าไม่มีออเดอร์)
  const unknown = ordersQuery.isError && !orders
  const updateStatus = useUpdateOrderStatus()
  const clearOrder = useClearOrder()
  // ยกเลิกใช้ mutation แยก — ไม่งั้นกดเลื่อนตั๋วใบอื่นแล้วกล่องยกเลิกขึ้น "กำลังยกเลิก..." / error ของใบอื่น
  const cancelOrder = useUpdateOrderStatus()

  // ตั๋วที่กำลังส่งคำขออยู่ — useMutation จำได้แค่คำขอล่าสุด กด A แล้วกด B
  // A จะปลดล็อกทั้งที่ยังส่งไม่เสร็จ (กดซ้ำได้) จึงเก็บ id ไว้เองทีละใบ
  // ใช้ mutateAsync เพราะ callback ที่ส่งให้ mutate() ทำงานแค่กับคำขอล่าสุด
  const [inFlight, setInFlight] = useState<ReadonlySet<string>>(() => new Set())
  const track = (id: string, run: () => Promise<unknown>) => {
    setInFlight((prev) => new Set(prev).add(id))
    run()
      .catch(() => {}) // error แสดงผ่าน ErrorNote จาก state ของ mutation อยู่แล้ว
      .finally(() =>
        setInFlight((prev) => {
          const next = new Set(prev)
          next.delete(id)
          return next
        }),
      )
  }

  // ตั๋วที่กด "ทำเสร็จแล้ว" แต่ยังอยู่ในช่วงเลิกทำได้ — แสดงในคอลัมน์เสร็จแล้วทันที แต่ยังไม่ส่ง
  const serveTimers = useRef(new Map<string, ReturnType<typeof setTimeout>>())
  const [deferred, setDeferred] = useState<ReadonlySet<string>>(() => new Set())
  const sendServed = (id: string) =>
    track(id, () => updateStatus.mutateAsync({ id, status: OrderStatus.SERVED }))
  const undeferred = (id: string) =>
    setDeferred((prev) => {
      const next = new Set(prev)
      next.delete(id)
      return next
    })

  const deferServe = (order: Order) => {
    const timer = setTimeout(() => {
      serveTimers.current.delete(order.id)
      undeferred(order.id)
      sendServed(order.id)
    }, UNDO_MS)
    serveTimers.current.set(order.id, timer)
    setDeferred((prev) => new Set(prev).add(order.id))
    setAnnouncement(`${order.placeLabel} ทำเสร็จแล้ว กดยกเลิกบนตั๋วได้ภายใน ${UNDO_MS / 1000} วินาที`)
  }

  // เลิกทำอยู่บนตั๋วเอง ไม่ใช่ toast ลอยบนจอ — สายตาครัวอยู่ที่ตั๋วที่เพิ่งกด และไม่บังหัวจอ
  const undoServe = (id: string) => {
    const pending = serveTimers.current.get(id)
    if (pending === undefined) return // ส่งไปแล้ว
    clearTimeout(pending)
    serveTimers.current.delete(id)
    undeferred(id)
  }

  // ออกจากหน้าระหว่างรอ → ส่งที่ค้างไว้ทันที ไม่งั้นออเดอร์ค้าง "กำลังปรุง" ทั้งที่ครัวกดเสร็จแล้ว
  const sendServedRef = useRef(sendServed)
  useEffect(() => {
    sendServedRef.current = sendServed
  })
  useEffect(() => {
    const timers = serveTimers.current
    return () => {
      for (const [id, timer] of timers) {
        clearTimeout(timer)
        sendServedRef.current(id)
      }
      timers.clear()
    }
  }, [])

  // ติ๊กรายอาหารว่าทำแล้ว — เป็นตัวช่วยของครัว ไม่ได้ส่งขึ้น backend
  const [checked, setChecked] = useState<Record<string, boolean>>({})
  /** ออเดอร์ที่กำลังถามยืนยันว่าจะยกเลิก — null = ไม่มีกล่องเปิดอยู่ */
  const [cancelling, setCancelling] = useState<Order | null>(null)
  /** ข้อความให้ screen reader อ่านเมื่อมีออเดอร์ใหม่ — เสียงติ๊งต่องอย่างเดียวไม่บอกว่าเกิดอะไร */
  const [announcement, setAnnouncement] = useState('')

  // เวลารอต้องเดินเอง ไม่ใช่รอ refetch ถึงจะขยับ
  const [, setTick] = useState(0)
  useEffect(() => {
    const timer = setInterval(() => setTick((t) => t + 1), 30_000)
    return () => clearInterval(timer)
  }, [])

  // เคลียร์แล้วเก็บไว้ที่ backend (clearedAt) ไม่ใช่ใน state
  // ไม่งั้นรีเฟรชก็กลับมา จอครัวอีกเครื่องก็ยังเห็น และพอแคชเชียร์ยกเลิกบิล
  // ออเดอร์ที่เสิร์ฟไปนานแล้วจะเด้งกลับขึ้นบอร์ดเหมือนมีของต้องทำใหม่
  const visible = (orders ?? []).filter((o) => !o.clearedAt)

  // ออเดอร์ใหม่เข้าคิว → ติ๊งต่อง (ครัวไม่ได้จ้องจอตลอด) / จอไม่ดับระหว่างเปิดหน้านี้
  useEffect(installAudioUnlock, [])
  const screenAwake = useWakeLock()
  useNewArrivals(
    orders && visible.filter((o) => o.status === OrderStatus.PENDING).map((o) => o.id),
    (count) => {
      playAlert('order')
      setAnnouncement(`มีออเดอร์ใหม่ ${count} ออเดอร์`)
    },
  )

  const toggleItem = (itemId: string, isChecked: boolean) => {
    setChecked((prev) => ({ ...prev, [itemId]: isChecked }))
  }

  const handleAdvance = (order: Order, key: ColumnKey) => {
    if (key === 'queue') {
      track(order.id, () => updateStatus.mutateAsync({ id: order.id, status: OrderStatus.PREPARING }))
    } else if (key === 'cooking') {
      deferServe(order)
    } else {
      track(order.id, () => clearOrder.mutateAsync(order.id))
    }
  }

  return (
    <div className="relative">
      <p role="status" aria-live="polite" className="sr-only">
        {announcement}
      </p>
      <KitchenAlertBar screenAwake={screenAwake} />
      {ordersQuery.isError && (
        <LoadError
          what="ออเดอร์"
          stale={Boolean(orders)}
          error={ordersQuery.error}
          onRetry={() => ordersQuery.refetch()}
        />
      )}
      <ErrorNote error={updateStatus.error ?? clearOrder.error} />

      {isPending && !ordersQuery.isError && (
        <>
          <p className="sr-only">กำลังโหลดออเดอร์</p>
          <BoardSkeleton />
        </>
      )}

      {!isPending && !unknown && (
        <div className="grid gap-4 md:grid-cols-3 md:divide-x md:divide-gray-200">
          {columns.map((column) => {
            // ตั๋วที่รอเลิกทำ แสดงเหมือนเสร็จแล้ว ให้ครัวเห็นผลทันทีที่กด
            const list = visible.filter(
              (o) => (deferred.has(o.id) ? OrderStatus.SERVED : o.status) === column.status,
            )

            return (
              <section key={column.key} aria-label={column.title} className="md:px-3">
                <header className="mb-3 flex items-center justify-between gap-2">
                  <div className="flex min-w-0 items-center gap-2">
                    <span className={`h-3.5 w-3.5 shrink-0 rounded-full ${column.dot}`} />
                    <h2 className="truncate text-lg font-bold text-black lg:text-xl">
                      {column.title}
                    </h2>
                  </div>
                  <span
                    className={`shrink-0 whitespace-nowrap rounded-full px-3 py-1 text-sm font-bold ${column.badge}`}
                  >
                    {list.length}
                    {/* iPad แนวตั้ง 3 คอลัมน์แคบ — ตัดคำว่า "รายการ" ออก ชื่อคอลัมน์จะได้ไม่โดนตัด */}
                    <span className="hidden lg:inline"> รายการ</span>
                  </span>
                </header>

                <div className="space-y-4">
                  {list.length === 0 && (
                    <p className="py-6 text-center text-sm text-gray-500">ไม่มีรายการ</p>
                  )}

                  {list.map((order) => (
                    <KitchenTicket
                      key={order.id}
                      order={order}
                      column={column}
                      busy={inFlight.has(order.id)}
                      awaitingUndo={deferred.has(order.id)}
                      checked={checked}
                      onToggle={toggleItem}
                      onAdvance={() => handleAdvance(order, column.key)}
                      onUndo={() => undoServe(order.id)}
                      onCancel={() => {
                        cancelOrder.reset()
                        setCancelling(order)
                      }}
                    />
                  ))}
                </div>
              </section>
            )
          })}
        </div>
      )}

      {cancelling && (
        <ConfirmDialog
          title="ยกเลิกออเดอร์"
          subject={`ออเดอร์ #${cancelling.orderRef}`}
          detail={`${cancelling.placeLabel} · ${cancelling.items.length} รายการ`}
          consequence="ออเดอร์นี้จะไม่ถูกคิดเงิน และลูกค้าจะเห็นว่าถูกยกเลิกทันที"
          confirmLabel="ยกเลิกออเดอร์"
          pendingLabel="กำลังยกเลิก..."
          isPending={cancelOrder.isPending}
          error={cancelOrder.error}
          onCancel={() => setCancelling(null)}
          onConfirm={() =>
            cancelOrder.mutate(
              { id: cancelling.id, status: OrderStatus.CANCELLED },
              { onSuccess: () => setCancelling(null) },
            )
          }
        />
      )}
    </div>
  )
}

/** ออเดอร์ที่เข้ามาไม่ถึงนี้ (นาที) ติดป้าย "ใหม่" — คนที่ไม่ได้ยินเสียงก็เห็นว่าใบไหนเพิ่งเข้า */
const NEW_MINUTES = 1

function ClockIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      aria-hidden
      className="h-4 w-4 shrink-0"
    >
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </svg>
  )
}

function AlertIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className="h-4 w-4 shrink-0"
    >
      <path d="M12 3 2 20h20L12 3Z" />
      <path d="M12 10v4M12 17h.01" />
    </svg>
  )
}

/** ตั๋วออเดอร์หนึ่งใบบนบอร์ดครัว */
function KitchenTicket({
  order,
  column,
  busy: sending,
  awaitingUndo,
  checked,
  onToggle,
  onAdvance,
  onUndo,
  onCancel,
}: Readonly<{
  order: Order
  column: (typeof columns)[number]
  busy: boolean
  /** กดเสร็จแล้ว ยังอยู่ในช่วงเลิกทำได้ — ห้ามกด "เอาออก" ก่อน backend รู้ว่าเสร็จ */
  awaitingUndo: boolean
  checked: Record<string, boolean>
  onToggle: (itemId: string, checked: boolean) => void
  onAdvance: () => void
  onUndo: () => void
  onCancel: () => void
}>) {
  const done = column.key === 'done'
  const waited = waitedMinutes(order.createdAt)
  const late = !done && waited >= LATE_MINUTES
  const fresh = column.key === 'queue' && waited < NEW_MINUTES
  const busy = sending || awaitingUndo

  return (
    <article aria-busy={busy} className={`rounded-xl border-2 bg-white p-3 ${column.border}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="flex flex-wrap items-center gap-2 text-xl font-bold text-black lg:text-2xl">
            {order.placeLabel}
            {fresh && (
              <span className="rounded-full bg-status-queue-ink px-2 py-0.5 text-xs font-bold text-white">
                ใหม่
              </span>
            )}
            {/* เห็นตั้งแต่หัวตั๋ว ก่อนไล่อ่านทีละจาน */}
            {!done && order.items.some((item) => isAllergyNote(item.note)) && (
              <span className="rounded-full bg-danger-ink px-2 py-0.5 text-xs font-bold text-white">
                แพ้อาหาร
              </span>
            )}
          </p>
          {/* แค่ "#เลข" — คอลัมน์ iPad แนวตั้งแคบ มีคำว่า "ออเดอร์" นำหน้าแล้วตัดเป็น 2 บรรทัด */}
          <p className="whitespace-nowrap text-sm font-semibold text-gray-700">
            <span className="sr-only">ออเดอร์ </span>#{order.orderRef}
          </p>
        </div>

        {/* ยกเลิกอยู่หัวตั๋ว ห่างจากปุ่มหลักล่างตั๋ว — มือเปียก/ใส่ถุงมือกดพลาดยาก
            คอลัมน์เสร็จแล้วไม่มี: ของเสิร์ฟไปแล้ว จะไม่คิดเงินเป็นเรื่องของแคชเชียร์ */}
        {!done && (
          <button
            type="button"
            aria-label="ยกเลิกออเดอร์"
            disabled={busy}
            onClick={onCancel}
            className="flex min-h-11 shrink-0 items-center gap-1 rounded-lg border-2 border-gray-300 px-3 text-sm font-semibold text-danger-ink transition hover:border-danger hover:bg-danger/5 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              aria-hidden
              className="h-4 w-4"
            >
              <path d="M6 6l12 12M18 6 6 18" />
            </svg>
            ยกเลิก
          </button>
        )}
      </div>

      {/* เวลารอซ่อนในคอลัมน์เสร็จแล้ว — ของออกไปแล้ว ไม่ได้ "รอ" อะไรอีก
          เกินเวลา = ป้ายทึบ + ไอคอนเตือน (รูปทรงเปลี่ยน ไม่ได้บอกด้วยสีอย่างเดียว)
          ข้อความสั้นบรรทัดเดียว — เดิม "รอ 18 นาที · เกิน 15 นาที" ตัดเป็น 2 บรรทัดในคอลัมน์แคบ */}
      {!done && (
        <p
          className={`mt-2 inline-flex items-center gap-1.5 whitespace-nowrap rounded-full text-base tabular-nums ${
            late ? 'bg-danger-ink px-3 py-1 font-bold text-white' : 'font-semibold text-gray-700'
          }`}
        >
          {late ? <AlertIcon /> : <ClockIcon />}
          {/* นาทีแรกขึ้น "เพิ่งสั่ง" — "รอมาแล้ว 0 นาที" อ่านแล้วแปลก */}
          {waited < 1 ? 'เพิ่งสั่ง' : `รอมาแล้ว ${waited} นาที`}
          {late && <span className="sr-only"> เกินเวลา {LATE_MINUTES} นาที</span>}
        </p>
      )}

      <ul className="mt-2 space-y-2">
        {order.items.map((item) => (
          <KitchenItemRow
            key={item.id}
            item={item}
            columnKey={column.key}
            checked={Boolean(checked[item.id])}
            onToggle={(isChecked) => onToggle(item.id, isChecked)}
          />
        ))}
      </ul>

      {awaitingUndo ? (
        // แถบเลิกทำแทนที่ปุ่มหลัก ตำแหน่งเดียวกับปุ่มที่เพิ่งกด — กดพลาดก็กดซ้ำที่เดิมเพื่อย้อน
        <div className="mt-3">
          <button
            type="button"
            onClick={onUndo}
            className="flex min-h-12 w-full items-center justify-center gap-2 rounded-lg border-2 border-status-done-ink bg-white px-4 text-base font-bold text-status-done-ink transition hover:bg-status-done/10"
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden
              className="h-5 w-5"
            >
              <path d="M9 14 4 9l5-5" />
              <path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11" />
            </svg>
            ยกเลิก
          </button>
          {/* เวลาที่เหลือก่อนส่งจริง หดจากเต็มเหลือศูนย์ */}
          <div aria-hidden className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-status-done/20">
            <div
              className="undo-drain h-full origin-left rounded-full bg-status-done-ink"
              style={{ animationDuration: `${UNDO_MS}ms` }}
            />
          </div>
        </div>
      ) : (
        <button
          type="button"
          disabled={busy}
          onClick={onAdvance}
          className={`mt-3 min-h-12 w-full rounded-lg px-4 text-base font-bold text-white transition disabled:cursor-not-allowed disabled:opacity-60 ${column.button}`}
        >
          {sending ? 'กำลังส่ง...' : column.buttonLabel}
        </button>
      )}
    </article>
  )
}
