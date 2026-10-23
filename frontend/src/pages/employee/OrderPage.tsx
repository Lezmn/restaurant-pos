import {
  useClearOrder,
  useOrders,
  useUpdateOrderStatus,
} from '@/features/orders/hooks'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { ErrorNote } from '@/components/ui/ErrorNote'
import { installAudioUnlock, playAlert, unlockAudio, useAlertSound } from '@/lib/alert-sound'
import { LIVE_POLL_MS } from '@/lib/live'
import { useNewArrivals } from '@/lib/use-new-arrivals'
import { useWakeLock } from '@/lib/use-wake-lock'
import { OrderStatus } from '@/types/enums'
import type { Order, OrderItem } from '@/types/models'
import { useEffect, useState } from 'react'

// socket สั่ง refetch ให้อยู่แล้ว — poll นี้เป็นตัวสำรองตอน socket หลุด
const POLL_MS = LIVE_POLL_MS

const waitedMinutes = (iso: string) =>
  Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60_000))

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
        columnKey === 'done' ? 'text-gray-400' : ''
      }`}
    >
      {/* คอลัมน์กำลังปรุง: ทั้งแถวเป็น label แตะตรงไหนก็ติ๊กได้
          จอครัวบน iPad มือเปียก/ใส่ถุงมือ เล็ง checkbox 20px ไม่ไหว */}
      <label
        className={`flex min-h-8 items-center justify-between gap-2 ${
          columnKey === 'cooking' ? 'cursor-pointer' : ''
        }`}
      >
        <span className="text-sm">
          <span className="font-bold">{item.quantity}</span> {item.menuItemName}
          {item.optionNames.length > 0 && (
            <span className="text-gray-500"> ({item.optionNames.join(', ')})</span>
          )}
        </span>

        {columnKey === 'cooking' && (
          <input
            type="checkbox"
            aria-label={`ทำ ${item.menuItemName} แล้ว`}
            checked={checked}
            onChange={(e) => onToggle(e.target.checked)}
            className="h-6 w-6 shrink-0 accent-brand-300"
          />
        )}
      </label>

      {item.note && columnKey !== 'done' && (
        <p className="mt-0.5 flex items-center gap-1 text-sm text-status-queue">
          <span className="h-1.5 w-1.5 rounded-full bg-status-queue" />
          {item.note}
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
    badge: 'bg-status-queue/15 text-status-queue',
    button: 'bg-status-queue',
    buttonLabel: 'เริ่มปรุง',
  },
  {
    key: 'cooking',
    title: 'กำลังปรุง',
    status: OrderStatus.PREPARING,
    dot: 'bg-brand-300',
    border: 'border-brand-300',
    badge: 'bg-brand-50 text-brand-400',
    button: 'bg-status-cooking',
    buttonLabel: 'ทำเสร็จแล้ว',
  },
  {
    key: 'done',
    title: 'เมนูที่ทำเสร็จ',
    status: OrderStatus.SERVED,
    dot: 'bg-status-done',
    border: 'border-status-done',
    badge: 'bg-status-done/15 text-status-done',
    button: 'bg-status-done',
    buttonLabel: 'ทำเสร็จเรียบร้อย',
  },
]

/**
 * แถบบนจอครัว: เสียงแจ้งเตือนออเดอร์ใหม่ (เปิด/ปิดต่อเครื่อง) + สถานะกันจอดับ
 * แท็บเล็ตไม่ยอมเล่นเสียงจนกว่าจะแตะจอ 1 ครั้ง — ขึ้นปุ่มใหญ่ให้แตะตอนเปิดหน้ามา
 */
function KitchenAlertBar({ screenAwake }: Readonly<{ screenAwake: boolean }>) {
  const { enabled, unlocked, setEnabled } = useAlertSound()

  return (
    <div className="mb-4 flex flex-wrap items-center justify-end gap-x-4 gap-y-2">
      {enabled && !unlocked && (
        <button
          type="button"
          onClick={unlockAudio}
          className="mr-auto min-h-11 rounded-lg bg-status-queue px-4 text-sm font-bold text-white"
        >
          แตะเพื่อเปิดเสียงแจ้งเตือนออเดอร์ใหม่
        </button>
      )}
      {screenAwake && <span className="text-sm text-gray-600">หน้าจอเปิดค้างไว้ระหว่างอยู่หน้านี้</span>}
      <button
        type="button"
        aria-pressed={enabled}
        onClick={() => setEnabled(!enabled)}
        className="min-h-11 rounded-lg border-2 border-gray-300 bg-white px-3 text-sm font-bold text-black transition hover:bg-gray-50"
      >
        เสียงแจ้งเตือน: {enabled ? 'เปิด' : 'ปิด'}
      </button>
    </div>
  )
}

export function OrderPage() {
  const { data: orders, isPending } = useOrders({ refetchInterval: POLL_MS })
  const updateStatus = useUpdateOrderStatus()
  const clearOrder = useClearOrder()

  // ติ๊กรายอาหารว่าทำแล้ว — เป็นตัวช่วยของครัว ไม่ได้ส่งขึ้น backend
  const [checked, setChecked] = useState<Record<string, boolean>>({})
  /** ออเดอร์ที่กำลังถามยืนยันว่าจะยกเลิก — null = ไม่มีกล่องเปิดอยู่ */
  const [cancelling, setCancelling] = useState<Order | null>(null)

  // เคลียร์แล้วเก็บไว้ที่ backend (clearedAt) ไม่ใช่ใน state
  // ไม่งั้นรีเฟรชก็กลับมา จอครัวอีกเครื่องก็ยังเห็น และพอแคชเชียร์ยกเลิกบิล
  // ออเดอร์ที่เสิร์ฟไปนานแล้วจะเด้งกลับขึ้นบอร์ดเหมือนมีของต้องทำใหม่
  const visible = (orders ?? []).filter((o) => !o.clearedAt)

  // ออเดอร์ใหม่เข้าคิว → ติ๊งต่อง (ครัวไม่ได้จ้องจอตลอด) / จอไม่ดับระหว่างเปิดหน้านี้
  useEffect(installAudioUnlock, [])
  const screenAwake = useWakeLock()
  useNewArrivals(
    orders && visible.filter((o) => o.status === OrderStatus.PENDING).map((o) => o.id),
    () => playAlert('order'),
  )

  const toggleItem = (itemId: string, isChecked: boolean) => {
    setChecked((prev) => ({ ...prev, [itemId]: isChecked }))
  }


  const handleAdvance = (order: Order, key: ColumnKey) => {
    if (key === 'queue') {
      updateStatus.mutate({ id: order.id, status: OrderStatus.PREPARING })
    } else if (key === 'cooking') {
      updateStatus.mutate({ id: order.id, status: OrderStatus.SERVED })
    } else {
      clearOrder.mutate(order.id)
    }
  }

  return (
    <div className="relative">
      <KitchenAlertBar screenAwake={screenAwake} />
      <ErrorNote error={updateStatus.error ?? clearOrder.error} />

      {isPending && <p className="text-sm text-gray-500">กำลังโหลด...</p>}

      <div className="grid gap-4 md:grid-cols-3 md:divide-x md:divide-gray-200">
        {columns.map((column) => {
          const list = visible.filter((o) => o.status === column.status)

          return (
            <section key={column.key} className="md:px-3">
              <header className="mb-3 flex items-center justify-between gap-2">
                <div className="flex min-w-0 items-center gap-2">
                  <span className={`h-3.5 w-3.5 shrink-0 rounded-full ${column.dot}`} />
                  <h2 className="truncate text-base font-bold text-black lg:text-xl">
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
                  <p className="py-6 text-center text-sm text-gray-400">
                    ไม่มีรายการ
                  </p>
                )}

                {list.map((order) => (
                  <article
                    key={order.id}
                    className={`rounded-xl border-2 bg-white p-3 ${column.border}`}
                  >
                    <div className="flex items-baseline justify-between gap-2">
                      <p className="font-bold text-black">
                        โต๊ะ {order.tableName}
                      </p>
                      <p className="text-sm text-gray-600">
                        รอมาแล้ว {waitedMinutes(order.createdAt)} นาที
                      </p>
                    </div>
                    <p className="text-sm font-semibold text-gray-700">
                      ออเดอร์ #{order.orderRef}
                    </p>

                    <ul className="mt-2 space-y-2">
                      {order.items.map((item) => (
                        <KitchenItemRow
                          key={item.id}
                          item={item}
                          columnKey={column.key}
                          checked={Boolean(checked[item.id])}
                          onToggle={(isChecked) => toggleItem(item.id, isChecked)}
                        />
                      ))}
                    </ul>

                    <button
                      type="button"
                      disabled={updateStatus.isPending || clearOrder.isPending}
                      onClick={() => handleAdvance(order, column.key)}
                      className={`mt-3 w-full rounded-lg py-2.5 text-sm font-bold text-white transition disabled:opacity-60 ${column.button}`}
                    >
                      {column.buttonLabel}
                    </button>

                    <button
                      type="button"
                      disabled={updateStatus.isPending}
                      onClick={() => setCancelling(order)}
                      className="mt-2 min-h-10 w-full rounded-lg border border-gray-300 py-2 text-sm font-semibold text-gray-600 transition hover:border-danger hover:text-danger disabled:opacity-60"
                    >
                      ยกเลิกออเดอร์
                    </button>
                  </article>
                ))}
              </div>
            </section>
          )
        })}
      </div>

      {cancelling && (
        <ConfirmDialog
          title="ยกเลิกออเดอร์"
          subject={`ออเดอร์ #${cancelling.orderRef}`}
          detail={`โต๊ะ ${cancelling.tableName} · ${cancelling.items.length} รายการ`}
          consequence="ออเดอร์นี้จะไม่ถูกคิดเงิน และลูกค้าจะเห็นว่าถูกยกเลิกทันที"
          confirmLabel="ยกเลิกออเดอร์"
          pendingLabel="กำลังยกเลิก..."
          isPending={updateStatus.isPending}
          error={updateStatus.error}
          onCancel={() => setCancelling(null)}
          onConfirm={() =>
            updateStatus.mutate(
              { id: cancelling.id, status: OrderStatus.CANCELLED },
              { onSuccess: () => setCancelling(null) },
            )
          }
        />
      )}
    </div>
  )
}
