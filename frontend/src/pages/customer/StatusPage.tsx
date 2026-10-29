import { useSession, useSessionOrders } from '@/features/public/hooks'
import { formatBaht } from '@/lib/format'
import { itemTotal, orderTotal } from '@/features/orders/order-total'
import { OrderStatus } from '@/types/enums'
import type { Order } from '@/types/models'
import { Link, useParams } from 'react-router-dom'

const stepLabels = ['รับออเดอร์แล้ว', 'กำลังปรุงอาหาร', 'เสิร์ฟแล้ว']

/**
 * สีตามสถานะ — ตรงกับฝั่งครัว (The Fixed Status Rule ใน DESIGN.md)
 * bar = แถบความคืบหน้า, pill = ป้ายสถานะ (ใช้ -ink บนพื้นอ่อนให้ผ่าน 4.5:1)
 */
const tones = [
  { bar: 'bg-status-queue', pill: 'bg-status-queue/10 text-status-queue-ink' },
  { bar: 'bg-status-cooking', pill: 'bg-brand-50 text-status-cooking-ink' },
  { bar: 'bg-status-done', pill: 'bg-status-done/15 text-status-done-ink' },
]

const stepIndex = (order: Order) => {
  if (order.status === OrderStatus.SERVED || order.status === OrderStatus.PAID)
    return 2
  if (order.status === OrderStatus.PREPARING) return 1
  return 0
}

export function CustomerStatusPage() {
  const { token } = useParams()
  const { data: session } = useSession(token)
  const { data: orders, isPending } = useSessionOrders(token)

  if (isPending) return <p className="text-sm md:text-base text-gray-600">กำลังโหลด...</p>

  // ยกเลิกใบไหนก็ต้องบอก ไม่ใช่เฉพาะใบล่าสุด — ลูกค้าจะได้ไม่นั่งรอของที่ไม่มีวันมา
  const cancelled = (orders ?? []).filter(
    (o) => o.status === OrderStatus.CANCELLED,
  )

  return (
    <div className="lg:mx-auto lg:max-w-2xl">
      <h1 className="text-xl md:text-2xl font-bold text-ink">ติดตามสถานะออเดอร์</h1>
      <p className="text-sm md:text-base text-gray-600">
        {session ? `โต๊ะ ${session.tableName} : ` : ''}
        ทั้งหมด {orders?.length ?? 0} รายการ
      </p>

      {!orders?.length ? (
        <div className="mt-6 rounded-2xl border-2 border-brand-75 bg-white px-4 py-10 text-center">
          <p className="text-sm md:text-base text-gray-600">ไม่มีออเดอร์</p>
          <Link
            to={`/t/${token}`}
            className="mt-4 inline-flex min-h-12 items-center rounded-2xl bg-brand-500 px-6 text-sm md:text-base font-bold text-white"
          >
            เลือกเมนู
          </Link>
          {/* ยังไม่สั่งก็เรียกพนักงานได้จากปุ่มบน header (ถามเมนู ขอช้อนส้อม แพ้อาหาร) */}
          <p className="mt-3 text-xs text-gray-600 md:text-sm">
            มีคำถามเรื่องเมนูหรือแพ้อาหาร กด “เรียกพนักงาน” ด้านบนได้เลย
          </p>
        </div>
      ) : (
        <>
          {/* ครัวยกเลิกออเดอร์ = ลูกค้าต้องรู้ทันที ไม่ใช่นั่งรอของที่ไม่มีวันมา */}
          {cancelled.length > 0 && (
            <div role="alert" className="mt-4 flex gap-3 rounded-2xl border-2 border-danger/40 bg-danger/5 p-4">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden className="mt-0.5 h-6 w-6 shrink-0 text-danger-ink">
                <circle cx="12" cy="12" r="9" />
                <path d="M5.6 5.6l12.8 12.8" strokeLinecap="round" />
              </svg>
              <div>
                <p className="font-bold text-danger-ink">
                  ออเดอร์ {cancelled.map((o) => `#${o.orderRef}`).join(', ')}{' '}
                  ถูกยกเลิก
                </p>
                <p className="mt-1 text-sm md:text-base text-gray-700">
                  ทางร้านยกเลิกให้แล้ว และจะไม่คิดเงินรายการนี้
                  หากมีข้อสงสัยกรุณากดเรียกพนักงาน
                </p>
              </div>
            </div>
          )}

          <ul className="mt-4 space-y-3">
            {orders.map((order) => (
              <OrderCard key={order.id} order={order} />
            ))}
          </ul>

          <div className="mt-4 flex gap-3">
            <Link
              to={`/t/${token}`}
              className="flex min-h-14 flex-1 items-center justify-center rounded-2xl border-2 border-brand-500 bg-white text-base font-bold text-brand-500 hover:bg-brand-50"
            >
              สั่งเพิ่ม
            </Link>
            <Link
              to={`/t/${token}/bill`}
              className="flex min-h-14 flex-[1.4] items-center justify-center rounded-2xl bg-brand-500 text-base font-bold text-white"
            >
              เช็คบิล
            </Link>
          </div>
        </>
      )}
    </div>
  )
}

function OrderCard({ order }: Readonly<{ order: Order }>) {
  const cancelled = order.status === OrderStatus.CANCELLED
  const current = stepIndex(order)
  const tone = tones[current]
  const waiting = !cancelled && current < 2

  return (
    <li
      className={`rounded-2xl border-2 p-4 ${
        cancelled ? 'border-danger/30 bg-danger/5' : 'border-brand-75 bg-white'
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <p className="text-base font-bold text-ink">ออเดอร์ #{order.orderRef}</p>
        {cancelled ? (
          <span className="rounded-full bg-danger/15 px-2.5 py-0.5 text-xs md:text-sm font-bold text-danger-ink">
            ยกเลิกแล้ว
          </span>
        ) : (
          <span className={`rounded-full px-2.5 py-0.5 text-xs md:text-sm font-bold ${tone.pill}`}>
            {stepLabels[current]}
          </span>
        )}
      </div>

      {!cancelled && (
        <>
          {/* แถบ 3 ช่อง: ทึบเท่ากับขั้นที่ผ่านมาแล้ว สีตามสถานะปัจจุบัน */}
          <div
            role="progressbar"
            aria-label={`สถานะออเดอร์ #${order.orderRef}`}
            aria-valuemin={1}
            aria-valuemax={3}
            aria-valuenow={current + 1}
            aria-valuetext={stepLabels[current]}
            className="mt-3 flex gap-1.5"
          >
            {stepLabels.map((label, index) => (
              <span
                key={label}
                className={`h-1.5 flex-1 rounded-full ${index <= current ? tone.bar : 'bg-gray-200'}`}
              />
            ))}
          </div>
          <div aria-hidden className="mt-1.5 flex justify-between text-xs font-semibold text-gray-600">
            {stepLabels.map((label, index) => (
              <span key={label} className={index === current ? 'text-ink' : ''}>
                {label}
              </span>
            ))}
          </div>
        </>
      )}

      <ul className="mt-3 space-y-1">
        {order.items.map((item) => (
          <li key={item.id} className="flex justify-between gap-3 text-sm md:text-base">
            <span className="min-w-0 text-gray-800">
              <span className="font-bold text-qty tabular-nums">{item.quantity}×</span>{' '}
              <span className="font-semibold">{item.menuItemName}</span>
              {item.optionNames.length > 0 && (
                <span className="text-gray-600"> ({item.optionNames.join(', ')})</span>
              )}
              {item.note && (
                <span className="block text-xs md:text-sm font-semibold text-brand-500">
                  {item.note}
                </span>
              )}
            </span>
            <span className="shrink-0 text-gray-700 tabular-nums">{formatBaht(itemTotal(item))}</span>
          </li>
        ))}
      </ul>

      <div className="mt-3 flex items-center justify-between gap-3 border-t border-brand-75 pt-2">
        <span className="text-sm font-bold text-brand-500">
          {waiting ? 'คาดว่าจะได้รับในอีก 10 - 15 นาที' : ''}
        </span>
        <p className="text-sm md:text-base font-bold tabular-nums">
          {cancelled ? (
            <>
              <span className="text-gray-500 line-through">{formatBaht(orderTotal(order))}</span>{' '}
              <span className="text-danger-ink">ไม่คิดเงิน</span>
            </>
          ) : (
            <span className="text-price">{formatBaht(orderTotal(order))}</span>
          )}
        </p>
      </div>
    </li>
  )
}
