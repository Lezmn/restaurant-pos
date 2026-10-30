import {
  useClearOrder,
  useOrders,
  useUpdateOrderStatus,
} from '@/features/orders/hooks'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { ErrorNote } from '@/components/ui/ErrorNote'
import { LoadError } from '@/components/ui/LoadError'
import { installAudioUnlock, playAlert } from '@/lib/alert-sound'
import { isAllergyNote } from '@/lib/item-note'
import { KitchenSoldOutButton } from '@/pages/employee/KitchenSoldOut'
import { LIVE_POLL_MS } from '@/lib/live'
import { useNewArrivals } from '@/lib/use-new-arrivals'
import { useWakeLock } from '@/lib/use-wake-lock'
import { OrderStatus } from '@/types/enums'
import type { Order, OrderItem } from '@/types/models'
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'

// socket สั่ง refetch ให้อยู่แล้ว — poll นี้เป็นตัวสำรองตอน socket หลุด
const POLL_MS = LIVE_POLL_MS

// ปัดลง (นาทีเต็ม) — ปัดเศษทำให้ 30 วิแรกขึ้น "รอ 1 นาที" และป้าย "ใหม่" หายเร็วกว่าที่ตั้งใจ
const waitedMinutes = (iso: string) =>
  Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 60_000))

/** สั้นพอให้อยู่บรรทัดเดียวในคอลัมน์ iPad แนวตั้ง — เกินชั่วโมงบอกเป็นชั่วโมง ไม่ใช่ "3331 นาที" */
const waitedLabel = (minutes: number, waiting: boolean) => {
  const prefix = waiting ? 'รอ ' : ''
  if (minutes < 1) return 'เพิ่งสั่ง'
  if (minutes < 60) return `${prefix}${minutes} นาที`
  return `${prefix}${Math.floor(minutes / 60)} ชม.`
}

/** กด "ทำเสร็จแล้ว" แล้วรอเท่านี้ก่อนส่งจริง ระหว่างนั้นกด "ยกเลิก" บนตั๋วได้
 *  backend ห้ามย้อน SERVED → PREPARING จึงต้องหน่วงไว้ฝั่งนี้ ไม่ใช่ส่งแล้วค่อยย้อน */
const UNDO_MS = 5000

type ColumnKey = 'queue' | 'cooking' | 'done'

type PlaceFilter = 'all' | 'dineIn' | 'takeaway'

const PLACE_FILTERS: Record<PlaceFilter, { label: string; match: (o: Order) => boolean }> = {
  all: { label: 'ทั้งหมด', match: () => true },
  dineIn: { label: 'ทานที่ร้าน', match: (o) => !o.isTakeaway },
  takeaway: { label: 'กลับบ้าน', match: (o) => o.isTakeaway },
}

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
    <li className={`py-2 ${columnKey === 'done' ? 'text-gray-500' : 'text-black'}`}>
      {/* คอลัมน์กำลังปรุง: ทั้งแถวเป็น label แตะตรงไหนก็ติ๊กได้
          จอครัวบน iPad มือเปียก/ใส่ถุงมือ เล็ง checkbox 20px ไม่ไหว */}
      <label
        className={`flex min-h-11 items-center justify-between gap-3 ${
          columnKey === 'cooking' ? 'cursor-pointer' : ''
        }`}
      >
        {/* ครัวอ่านจากระยะแขน — 16px ขึ้นไป จำนวนตัวใหญ่ให้เห็นก่อนชื่อ */}
        <span className={`text-base leading-snug ${checked ? 'text-gray-500 line-through' : ''}`}>
          <span className="mr-2 text-base font-bold text-brand-500 tabular-nums">{item.quantity}×</span>
          <span className="font-semibold">{item.menuItemName}</span>
          {item.optionNames.length > 0 && (
            <span className="block pl-7 text-sm text-gray-600">{item.optionNames.join(' · ')}</span>
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

      {/* โน้ตทุกชนิดเป็นกล่องแดงอ่อน + ไอคอน — แพ้อาหารเติมคำนำหน้า "แพ้อาหาร:" แยกจากโน้ตทั่วไปด้วยข้อความ ไม่ใช่สีอย่างเดียว */}
      {item.note && columnKey !== 'done' && (
        <p className="mt-1 mb-1.5 flex items-start gap-1.5 rounded-lg bg-danger/10 px-2.5 py-1.5 text-sm font-semibold text-danger-ink">
          <AlertIcon />
          <span>
            {isAllergyNote(item.note) && 'แพ้อาหาร: '}
            {item.note}
          </span>
        </p>
      )}
    </li>
  )
}

const columns: {
  key: ColumnKey
  title: string
  status: OrderStatus
  dot: string
  border: string
  band: string
  badge: string
  button: string
  buttonLabel: string
  /** คำบอกใบ้ท้ายหัวคอลัมน์ — บอกว่าคอลัมน์นี้ใครต้องทำอะไรต่อ */
  hint: string
}[] = [
  {
    key: 'queue',
    title: 'รอคิว',
    hint: 'กดเพื่อเริ่มทำ',
    status: OrderStatus.PENDING,
    dot: 'bg-status-queue',
    border: 'border-status-queue',
    // หัวใบสั่ง = พื้นอ่อนของสีสถานะ — ทึบไม่ได้ ป้ายเกินเวลาสีแดงจะกลืนกับหัวรอคิวที่เป็นแดงอิฐ
    band: 'bg-status-queue/10',
    badge: 'bg-status-queue-ink text-white',
    // สีปุ่ม = สีของคอลัมน์ตัวเอง ให้เข้าชุดกับหัวคอลัมน์
    // พื้นปุ่มตัวขาวใช้ -ink — สีสถานะปกติคอนทราสต์ไม่ถึง 4.5:1
    button: 'bg-status-queue-ink',
    buttonLabel: 'เริ่มทำ',
  },
  {
    key: 'cooking',
    title: 'กำลังทำ',
    hint: 'กดเมื่อพร้อมเสิร์ฟ',
    status: OrderStatus.PREPARING,
    dot: 'bg-status-cooking',
    border: 'border-status-cooking',
    band: 'bg-status-cooking/10',
    badge: 'bg-status-cooking-ink text-white',
    button: 'bg-status-cooking-ink',
    buttonLabel: 'ทำเสร็จ',
  },
  {
    key: 'done',
    title: 'เสร็จแล้ว รอเสิร์ฟ',
    hint: 'หน้าร้านกดเสิร์ฟ',
    status: OrderStatus.SERVED,
    dot: 'bg-status-done',
    border: 'border-status-done',
    band: 'bg-status-done/10',
    badge: 'bg-status-done-ink text-white',
    button: 'bg-status-done-ink',
    // กดแล้วตั๋วหายจากบอร์ด — ชื่อปุ่มไม่ซ้ำกับ "ทำเสร็จ" ของคอลัมน์ก่อนหน้า
    buttonLabel: 'เสิร์ฟแล้ว',
  },
]

/** รอเกินนี้ (นาที) ป้ายเวลาเป็นแดงทึบ + ไอคอนเตือน */
const LATE_MINUTES = 15

/** อันที่รอนานสุดขึ้นก่อน — ครัวทำตามคิว ไม่ต้องไล่หาใบเก่าที่ตกท้ายคอลัมน์ */
const byOldest = (a: Order, b: Order) =>
  new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()

/**
 * iPad แนวตั้ง 3 คอลัมน์แคบเกินไป (ตั๋วเหลือ ~190px ชื่อโต๊ะตัด 3 บรรทัด)
 * จึงแสดงแค่รอคิว + กำลังปรุง และย่อเสร็จแล้วเป็นแถบการ์ดเล็กด้านบน — แนวนอน/จอใหญ่ยังเป็น 3 คอลัมน์
 */
const PORTRAIT_TABLET = '(min-width: 768px) and (max-width: 1023px) and (orientation: portrait)'

function useMediaQuery(query: string) {
  const [matches, setMatches] = useState(() => window.matchMedia?.(query).matches ?? false)
  useEffect(() => {
    const mq = window.matchMedia?.(query)
    if (!mq) return
    const update = () => setMatches(mq.matches)
    update()
    mq.addEventListener('change', update)
    return () => mq.removeEventListener('change', update)
  }, [query])
  return matches
}

/** โครงตั๋วระหว่างโหลดครั้งแรก — ให้รูปทรงเหมือนบอร์ดจริง ไม่ใช่ข้อความลอย ๆ */
function BoardSkeleton() {
  return (
    <div aria-hidden className="grid gap-4 md:grid-cols-3">
      {columns.map((column) => (
        <div key={column.key} className="space-y-4 rounded-2xl bg-staff-column p-3">
          <div className="h-7 w-32 animate-pulse rounded bg-gray-200" />
          <div className="h-44 animate-pulse rounded-2xl bg-white/70" />
        </div>
      ))}
    </div>
  )
}

/**
 * ที่เว้นไว้ใต้บอร์ด — เท่ากับ md:pb-6 ของ <main> ใน EmployeeLayout
 * (แท็บเล็ตขึ้นไปเมนูย้ายไปแถบซ้ายแล้ว ไม่มีแถบล่างให้เว้นที่ — hook นี้ทำงานเฉพาะ md ขึ้นไป)
 */
const BOTTOM_NAV_SPACE = 24
/** บอร์ดเตี้ยกว่านี้ (จอเตี้ยมาก) ให้ทั้งหน้าเลื่อนแทน — คอลัมน์สั้นเกินเลื่อนดูไม่ไหว */
const MIN_BOARD_HEIGHT = 360
const TABLET_UP = '(min-width: 768px)'

/**
 * ความสูงที่ทำให้บอร์ดพอดีจอพอดี (จากขอบบนบอร์ดถึงเหนือแถบเมนูล่าง)
 * แท็บเล็ต/คอมเท่านั้น — มือถือคอลัมน์เรียงต่อกันเป็นแถวเดียว ให้ทั้งหน้าเลื่อนเหมือนเดิม
 * วัดใหม่ทุก render เพราะของเหนือบอร์ด (แถบ error, ปุ่มของหมด) โผล่/หายได้ตลอด
 */
function useFillScreen<T extends HTMLElement>() {
  const ref = useRef<T>(null)
  const [height, setHeight] = useState<number | null>(null)

  const measure = useCallback(() => {
    const el = ref.current
    if (!el || !window.matchMedia?.(TABLET_UP).matches) {
      setHeight(null)
      return
    }
    const top = el.getBoundingClientRect().top + window.scrollY
    const fit = Math.floor(window.innerHeight - top - BOTTOM_NAV_SPACE)
    setHeight(fit >= MIN_BOARD_HEIGHT ? fit : null)
  }, [])

  useLayoutEffect(measure)
  useEffect(() => {
    window.addEventListener('resize', measure)
    return () => window.removeEventListener('resize', measure)
  }, [measure])

  return [ref, height] as const
}

/**
 * รายการตั๋วในคอลัมน์ — แท็บเล็ต/คอมเลื่อนเฉพาะในคอลัมน์ หัวคอลัมน์ (ชื่อ + จำนวน) ค้างอยู่บน
 * มีตั๋วต่อด้านล่าง = ขอบล่างจางลง บอกว่ายังเลื่อนลงได้ (ครัวจะได้ไม่พลาดตั๋วที่ตกขอบ)
 */
function ColumnScroll({ label, children }: Readonly<{ label: string; children: ReactNode }>) {
  const ref = useRef<HTMLDivElement>(null)
  const [more, setMore] = useState(false)

  const check = useCallback(() => {
    const el = ref.current
    if (!el) return
    setMore(el.scrollHeight - el.scrollTop - el.clientHeight > 4)
  }, [])

  useEffect(() => {
    const el = ref.current
    if (!el || typeof ResizeObserver === 'undefined') return
    check()
    // ตั๋วเข้า/ออก หรือจอหมุน ความสูงเปลี่ยน — เช็คใหม่ว่ายังมีของต่อด้านล่างไหม
    const observer = new ResizeObserver(check)
    observer.observe(el)
    for (const child of el.children) observer.observe(child)
    return () => observer.disconnect()
  })

  return (
    <div className="relative md:min-h-0 md:flex-1">
      <div
        ref={ref}
        onScroll={check}
        // tabIndex: เลื่อนด้วยคีย์บอร์ดได้ / aria-label: บอกว่ากล่องเลื่อนนี้เป็นของคอลัมน์ไหน
        tabIndex={0}
        role="group"
        aria-label={`ตั๋ว${label}`}
        // relative: ข้อความ sr-only (absolute) ในตั๋วต้องอยู่ในกล่องเลื่อนนี้ ไม่งั้นหลุดออกไปดันหน้าให้ยาว
        className="relative space-y-3 md:h-full md:overflow-y-auto md:overscroll-contain md:pr-1 md:pb-4"
      >
        {children}
      </div>
      {more && (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 bottom-0 hidden h-16 bg-gradient-to-t from-staff-column to-transparent md:block"
        />
      )}
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
  /** ข้อความให้ screen reader อ่านเมื่อมีออเดอร์ใหม่ — เสียงติ๊งต่องอย่างเดียวไม่บอกว่าเกิดอะไร */
  const [announcement, setAnnouncement] = useState('')
  /** ออเดอร์ที่กำลังถามยืนยันว่าจะยกเลิก — null = ไม่มีกล่องเปิดอยู่ */
  const [cancelling, setCancelling] = useState<Order | null>(null)

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
  useWakeLock()
  useNewArrivals(
    orders && visible.filter((o) => o.status === OrderStatus.PENDING).map((o) => o.id),
    (count) => {
      playAlert('order')
      setAnnouncement(`มีออเดอร์ใหม่ ${count} ออเดอร์`)
    },
  )

  const [boardRef, boardHeight] = useFillScreen<HTMLDivElement>()
  const portrait = useMediaQuery(PORTRAIT_TABLET)
  // ตั๋วที่รอเลิกทำ แสดงเหมือนเสร็จแล้ว ให้ครัวเห็นผลทันทีที่กด
  const [place, setPlace] = useState<PlaceFilter>('all')
  const shown = visible.filter(PLACE_FILTERS[place].match)
  const listOf = (status: OrderStatus) =>
    shown
      .filter((o) => (deferred.has(o.id) ? OrderStatus.SERVED : o.status) === status)
      .sort(byOldest)
  // ตัวเลขบนแท็บนับเฉพาะตั๋วที่ยังอยู่บนบอร์ด (3 คอลัมน์รวมกัน) ไม่ขึ้นกับแท็บที่เลือกอยู่
  const board = visible.filter((o) => o.status !== OrderStatus.CANCELLED && o.status !== OrderStatus.PAID)
  const placeCount = (key: PlaceFilter) => board.filter(PLACE_FILTERS[key].match).length
  const doneColumn = columns[2]

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
      {/* หัวข้อสำหรับ screen reader — จอครัวเก็บพื้นที่แนวตั้งไว้ให้บอร์ด */}
      <h1 className="sr-only">คิวครัว</h1>
      <p role="status" aria-live="polite" className="sr-only">
        {announcement}
      </p>
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
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <div role="group" aria-label="กรองตามประเภทออเดอร์" className="flex flex-wrap gap-2">
          {(Object.keys(PLACE_FILTERS) as PlaceFilter[]).map((key) => (
            <button
              key={key}
              type="button"
              aria-pressed={place === key}
              onClick={() => setPlace(key)}
              className={`min-h-11 rounded-full border-2 px-4 text-base font-bold transition ${
                place === key
                  ? 'border-brand-500 bg-brand-500 text-white'
                  : 'border-staff-line bg-white text-gray-800 hover:bg-brand-50'
              }`}
            >
              {PLACE_FILTERS[key].label} <span className="tabular-nums">{placeCount(key)}</span>
            </button>
          ))}
          </div>
          <p className="ml-auto text-sm font-semibold text-gray-700">เรียงจากรอนานสุด</p>
          <KitchenSoldOutButton />
        </div>
      )}

      {!isPending && !unknown && portrait && (
        <DoneStrip
          column={doneColumn}
          orders={listOf(doneColumn.status)}
          inFlight={inFlight}
          deferred={deferred}
          onAdvance={(order) => handleAdvance(order, 'done')}
          onUndo={undoServe}
        />
      )}

      {!isPending && !unknown && (
        <div
          ref={boardRef}
          style={boardHeight ? { height: boardHeight } : undefined}
          className={`grid gap-4 ${portrait ? 'md:grid-cols-2' : 'md:grid-cols-3'}`}
        >
          {(portrait ? columns.filter((c) => c.key !== 'done') : columns).map((column) => {
            const list = listOf(column.status)

            return (
              <section
                key={column.key}
                aria-label={column.title}
                className="rounded-2xl bg-staff-column p-3 md:flex md:min-h-0 md:flex-col"
              >
                <header className="mb-3 flex items-center justify-between gap-2 px-1">
                  <div className="flex min-w-0 items-center gap-2">
                    <span className={`h-3.5 w-3.5 shrink-0 rounded-full ${column.dot}`} />
                    <h2 className="truncate text-lg font-bold text-text lg:text-xl">
                      {column.title}
                    </h2>
                  </div>
                  <span
                    className={`shrink-0 whitespace-nowrap rounded-full px-3 py-1 text-sm font-bold ${column.badge}`}
                  >
                    {list.length}
                  </span>
                  <span className="ml-auto hidden shrink-0 text-sm font-semibold text-gray-700 xl:block">
                    {column.hint}
                  </span>
                </header>

                <ColumnScroll label={column.title}>
                  {list.length === 0 && (
                    <p className="py-6 text-center text-sm font-semibold text-gray-600">ไม่มีรายการ</p>
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
                </ColumnScroll>
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
    // โครงใบสั่ง: หัวใบ (โต๊ะ + เวลารอ) / รายการคั่นเส้นประ / ปุ่มท้ายใบ
    <article
      aria-busy={busy}
      className={`overflow-hidden rounded-xl bg-white`}
    >
      <header className="px-3.5 pt-3 pb-2">
        <div className="flex items-start justify-between gap-x-2 gap-y-1">
          <p className="flex min-w-0 flex-wrap items-baseline gap-x-2 text-2xl leading-tight font-bold text-black">
            {order.placeLabel}
            <span className="text-sm font-semibold text-gray-600">
              <span className="sr-only">ออเดอร์ </span>#{order.orderRef}
            </span>
            {fresh && (
              <span className="self-center rounded-full bg-status-queue-ink px-2 py-0.5 text-xs font-bold text-white">
                ใหม่
              </span>
            )}
          </p>

          {!done && (
            <p
              className={`inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full text-sm tabular-nums ${waitChipClass(late)}`}
            >
              {late && <AlertIcon />}
              {waitedLabel(waited, column.key === 'queue')}
              {late && <span className="sr-only"> เกินเวลา {LATE_MINUTES} นาที</span>}
            </p>
          )}
        </div>

        {/* ยกเลิกอยู่หัวใบ ห่างจากปุ่มหลักท้ายใบ — มือเปียก/ใส่ถุงมือกดพลาดยาก
            คอลัมน์เสร็จแล้วไม่มี: ของเสิร์ฟไปแล้ว จะไม่คิดเงินเป็นเรื่องของแคชเชียร์ */}
        {!done && (
          <div className="mt-1 flex justify-end">
            <button
              type="button"
              aria-label="ยกเลิกออเดอร์"
              disabled={busy}
              onClick={onCancel}
              className="flex min-h-11 shrink-0 items-center gap-1 rounded-lg border-2 border-gray-300 bg-white px-3 text-sm font-semibold text-danger-ink transition hover:border-danger hover:bg-danger/5 disabled:cursor-not-allowed disabled:opacity-60"
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
          </div>
        )}
      </header>

      {/* รายการเป็นบรรทัดบนใบสั่ง คั่นเส้นประ — ไม่ใช่กล่องซ้อนกล่อง */}
      <ul className="divide-y divide-dashed divide-staff-line border-t-2 border-dashed border-staff-line px-3.5">
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

      <footer className={awaitingUndo ? 'border-t-2 border-dashed border-staff-line p-3' : ''}>
        {awaitingUndo ? (
          // แถบเลิกทำแทนที่ปุ่มหลัก ตำแหน่งเดียวกับปุ่มที่เพิ่งกด — กดพลาดก็กดซ้ำที่เดิมเพื่อย้อน
          <UndoServe onUndo={onUndo} />
        ) : (
          <button
            type="button"
            disabled={busy}
            onClick={onAdvance}
            className={`min-h-13 w-full px-4 text-lg font-bold text-white transition active:brightness-95 disabled:cursor-not-allowed disabled:opacity-60 ${column.button}`}
          >
            {sending ? 'กำลังส่ง...' : column.buttonLabel}
          </button>
        )}
      </footer>
    </article>
  )
}

/** ปุ่มเลิกทำ + แถบเวลาที่เหลือ หลังกด "ทำเสร็จแล้ว" — ใช้ทั้งบนตั๋วและการ์ดในแถบเสร็จแล้ว */
function UndoServe({ onUndo }: Readonly<{ onUndo: () => void }>) {
  return (
    <div>
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
  )
}

/**
 * คอลัมน์เสร็จแล้วตอน iPad แนวตั้ง — การ์ดเล็กเลื่อนแนวนอน ของออกจากครัวแล้ว ต้องการแค่
 * โต๊ะไหน + ปุ่มเอาออก (และเลิกทำหลังกด "ทำเสร็จแล้ว") พื้นที่ที่เหลือให้คิวที่ต้องทำ
 */
function DoneStrip({
  column,
  orders,
  inFlight,
  deferred,
  onAdvance,
  onUndo,
}: Readonly<{
  column: (typeof columns)[number]
  orders: Order[]
  inFlight: ReadonlySet<string>
  deferred: ReadonlySet<string>
  onAdvance: (order: Order) => void
  onUndo: (id: string) => void
}>) {
  return (
    <section aria-label={column.title} className="mb-4 rounded-xl border border-gray-200 p-3">
      <header className="flex items-center gap-2">
        <span className={`h-3.5 w-3.5 shrink-0 rounded-full ${column.dot}`} />
        <h2 className="text-lg font-bold text-black">{column.title}</h2>
        <span className={`rounded-full px-3 py-0.5 text-sm font-bold ${column.badge}`}>{orders.length}</span>
        {orders.length === 0 && <p className="text-sm text-gray-500">ไม่มีรายการ</p>}
      </header>

      {orders.length > 0 && (
        <ul className="mt-3 flex gap-3 overflow-x-auto overscroll-x-contain pb-1">
          {orders.map((order) => {
            const awaitingUndo = deferred.has(order.id)
            const sending = inFlight.has(order.id)
            return (
              <li
                key={order.id}
                aria-busy={sending || awaitingUndo}
                className={`flex w-56 shrink-0 flex-col overflow-hidden rounded-xl border-2 bg-white ${column.border}`}
              >
                <p className={`truncate px-3 py-2 text-xl font-bold text-black ${column.band}`}>
                  {order.placeLabel}
                </p>
                <p className="truncate border-t-2 border-dashed border-gray-300 px-3 py-2 text-sm text-gray-700">
                  {order.items.map((item) => `${item.quantity}× ${item.menuItemName}`).join(' · ')}
                </p>
                <div className="mt-auto border-t-2 border-dashed border-gray-300 p-3">
                  {awaitingUndo ? (
                    <UndoServe onUndo={() => onUndo(order.id)} />
                  ) : (
                    <button
                      type="button"
                      disabled={sending}
                      onClick={() => onAdvance(order)}
                      className={`min-h-12 w-full rounded-lg px-3 text-base font-bold text-white transition disabled:cursor-not-allowed disabled:opacity-60 ${column.button}`}
                    >
                      {sending ? 'กำลังส่ง...' : column.buttonLabel}
                    </button>
                  )}
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}

function waitChipClass(late: boolean) {
  return late ? 'bg-danger-ink px-3 py-1 font-bold text-white' : 'bg-gray-100 px-3 py-1 font-semibold text-gray-700'
}
