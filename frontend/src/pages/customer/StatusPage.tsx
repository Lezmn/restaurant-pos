import { useCallStaff, useSession, useSessionOrders } from '@/features/public/hooks'
import { formatBaht } from '@/lib/format'
import { itemTotal, orderTotal } from '@/features/orders/order-total'
import { OrderStatus } from '@/types/enums'
import type { Order } from '@/types/models'
import { Link, useParams } from 'react-router-dom'

const steps = [
  { status: OrderStatus.PENDING, label: 'รับออเดอร์แล้ว', icon: '✓' },
  { status: OrderStatus.PREPARING, label: 'กำลังปรุงอาหาร', icon: '🍳' },
  { status: OrderStatus.SERVED, label: 'เสิร์ฟแล้ว', icon: '🍽' },
]

/** สีเส้นเชื่อมระหว่างขั้นใน stepper — ทึบเมื่อเดินผ่านขั้นนั้นแล้ว */
const barColor = (passed: boolean) => (passed ? 'bg-brand-300' : 'bg-gray-200')

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
  const callStaff = useCallStaff()

  if (isPending) return <p className="text-sm md:text-base text-gray-500">กำลังโหลด...</p>

  const latest = orders?.[0]
  // ยกเลิกใบไหนก็ต้องบอก ไม่ใช่เฉพาะใบล่าสุด — ลูกค้าจะได้ไม่นั่งรอของที่ไม่มีวันมา
  const cancelled = (orders ?? []).filter(
    (o) => o.status === OrderStatus.CANCELLED,
  )

  return (
    <div className="lg:mx-auto lg:max-w-2xl">
      <h1 className="text-lg md:text-xl font-bold text-gray-900">ติดตามสถานะออเดอร์</h1>
      <p className="text-sm md:text-base text-gray-500">
        {session ? `โต๊ะ ${session.tableName} : ` : ''}
        ทั้งหมด {orders?.length ?? 0} รายการ
      </p>

      {!latest ? (
        <div className="mt-6 rounded-2xl border-2 border-brand-75 bg-white px-4 py-10 text-center">
          <p className="text-sm md:text-base text-gray-500">ไม่มีออเดอร์</p>
          <Link
            to={`/t/${token}`}
            className="mt-4 inline-block rounded-full bg-brand-300 px-6 py-2.5 text-sm md:text-base font-bold text-white"
          >
            เลือกเมนู
          </Link>
        </div>
      ) : (
        <>
          {/* ครัวยกเลิกออเดอร์ = ลูกค้าต้องรู้ทันที ไม่ใช่นั่งรอของที่ไม่มีวันมา */}
          {cancelled.length > 0 && (
            <div className="mt-4 rounded-2xl border-2 border-danger/40 bg-danger/5 p-5 text-center">
              <span aria-hidden className="text-3xl">
                🚫
              </span>
              <p className="mt-2 font-bold text-danger">
                ออเดอร์ {cancelled.map((o) => `#${o.orderRef}`).join(', ')}{' '}
                ถูกยกเลิก
              </p>
              <p className="mt-1 text-sm md:text-base text-gray-600">
                ทางร้านยกเลิกให้แล้ว และจะไม่คิดเงินรายการนี้
                หากมีข้อสงสัยกรุณากดเรียกพนักงาน
              </p>
            </div>
          )}

          {/* stepper */}
          {latest.status !== OrderStatus.CANCELLED && (
          <div className="mt-4 rounded-2xl border-2 border-brand-75 bg-white p-4">
            <ol className="flex items-start">
              {steps.map((step, index) => {
                const current = stepIndex(latest)
                const done = index <= current
                // เส้นเชื่อมซ้าย/ขวาของแต่ละขั้น: หัวกับท้ายไม่มีเส้น ที่เหลือทึบถ้าผ่านมาแล้ว
                const lineBefore = index === 0 ? 'bg-transparent' : barColor(done)
                const lineAfter =
                  index === steps.length - 1 ? 'bg-transparent' : barColor(index < current)
                return (
                  <li key={step.status} className="flex flex-1 flex-col items-center">
                    <div className="flex w-full items-center">
                      <span
                        className={`h-0.5 flex-1 ${lineBefore}`}
                      />
                      <span
                        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm md:text-base ${
                          done
                            ? 'bg-brand-300 text-white'
                            : 'bg-gray-100 text-gray-400'
                        }`}
                      >
                        {step.icon}
                      </span>
                      <span
                        className={`h-0.5 flex-1 ${lineAfter}`}
                      />
                    </div>
                    <span
                      className={`mt-2 text-center text-xs md:text-sm ${
                        done ? 'font-semibold text-gray-900' : 'text-gray-400'
                      }`}
                    >
                      {step.label}
                    </span>
                  </li>
                )
              })}
            </ol>

            {latest.status !== OrderStatus.SERVED && (
              <div className="mt-5 flex items-center justify-center gap-3 border-t border-brand-75 pt-4">
                <span aria-hidden className="text-2xl md:text-3xl">
                  ⏱
                </span>
                <div className="text-center">
                  <p className="text-sm md:text-base text-gray-600">คาดว่าจะได้รับในอีก</p>
                  <p className="text-xl md:text-2xl font-bold text-brand-400">
                    10 - 15 นาที
                  </p>
                </div>
              </div>
            )}
          </div>
          )}

          <button
            type="button"
            disabled={callStaff.isPending || callStaff.isSuccess}
            onClick={() => callStaff.mutate({ token: token as string })}
            className="mt-4 w-full rounded-xl border-2 border-brand-400 py-3 text-sm md:text-base font-bold text-brand-400 transition disabled:opacity-60"
          >
            📞 เรียกพนักงานเพื่อสอบถาม
          </button>

          {callStaff.isSuccess && (
            <p className="mt-4 rounded-xl bg-success/10 py-3 text-center text-sm md:text-base font-semibold text-success">
              กรุณารอพนักงานสักครู่
            </p>
          )}

          {/* รายการทั้งหมด */}
          <h2 className="mt-6 text-sm md:text-base font-semibold text-gray-700">
            รายการทั้งหมด
          </h2>
          <div className="mt-2 space-y-3">
            {orders?.map((order) => {
              const cancelled = order.status === OrderStatus.CANCELLED

              return (
              <div
                key={order.id}
                className={`rounded-2xl border-2 p-4 ${
                  cancelled
                    ? 'border-danger/30 bg-danger/5'
                    : 'border-brand-75 bg-white'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm md:text-base font-semibold text-gray-900">
                    ออเดอร์ #{order.orderRef}
                  </p>
                  {cancelled && (
                    <span className="rounded-full bg-danger/15 px-2.5 py-0.5 text-xs md:text-sm font-bold text-danger">
                      ยกเลิกแล้ว
                    </span>
                  )}
                </div>
                <ul className="mt-2 space-y-1">
                  {order.items.map((item) => (
                    <li
                      key={item.id}
                      className="flex justify-between gap-3 text-sm md:text-base"
                    >
                      <span className="min-w-0 text-gray-700">
                        {item.quantity}× {item.menuItemName}
                        {item.optionNames.length > 0 && (
                          <span className="text-gray-400">
                            {' '}
                            ({item.optionNames.join(', ')})
                          </span>
                        )}
                        {item.note && (
                          <span className="block text-xs md:text-sm text-brand-400">
                            {item.note}
                          </span>
                        )}
                      </span>
                      <span className="shrink-0 text-gray-500">
                        {formatBaht(itemTotal(item))}
                      </span>
                    </li>
                  ))}
                </ul>
                <p className="mt-2 border-t border-brand-75 pt-2 text-right text-sm md:text-base font-bold">
                  {cancelled ? (
                    <>
                      <span className="text-gray-400 line-through">
                        {formatBaht(orderTotal(order))}
                      </span>{' '}
                      <span className="text-danger">ไม่คิดเงิน</span>
                    </>
                  ) : (
                    <span className="text-price">
                      {formatBaht(orderTotal(order))}
                    </span>
                  )}
                </p>
              </div>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}
