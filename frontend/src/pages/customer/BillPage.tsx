import {
  useRequestCheckout,
  useSession,
  useSessionOrders,
} from '@/features/public/hooks'
import { formatBaht } from '@/lib/format'
import { itemTotal, orderTotal } from '@/features/orders/order-total'
import { OrderStatus, PaymentMethod } from '@/types/enums'
import { useState, type ReactNode } from 'react'
import { Link, useParams } from 'react-router-dom'

export function CustomerBillPage() {
  const { token } = useParams()
  const { data: session } = useSession(token)
  const { data: orders, isPending } = useSessionOrders(token)
  const checkout = useRequestCheckout()
  const [chosen, setChosen] = useState<PaymentMethod | null>(null)

  if (isPending) return <p className="text-sm md:text-base text-gray-500">กำลังโหลด...</p>

  // ออเดอร์ที่ครัวยกเลิกต้องไม่คิดเงิน — ยอดนี้ต้องตรงกับที่แคชเชียร์เก็บจริง
  const billable = (orders ?? []).filter(
    (o) => o.status !== OrderStatus.CANCELLED,
  )
  const cancelledCount = (orders ?? []).length - billable.length
  const items = billable.flatMap((o) => o.items)
  const total = billable.reduce((sum, o) => sum + orderTotal(o), 0)

  if (items.length === 0) {
    return (
      <div className="py-16 text-center">
        <p className="text-sm md:text-base text-gray-500">ยังไม่มีรายการที่สั่ง</p>
        <Link
          to={`/t/${token}`}
          className="mt-4 inline-block rounded-full bg-brand-300 px-6 py-2.5 text-sm md:text-base font-bold text-white"
        >
          เลือกเมนู
        </Link>
      </div>
    )
  }

  return (
    <div className="lg:mx-auto lg:max-w-2xl">
      <h1 className="text-xl md:text-2xl font-bold text-black">สรุปรายการอาหาร</h1>
      <p className="text-sm md:text-base text-gray-500">
        {session ? `โต๊ะ ${session.tableName} : ` : ''}
        ทั้งหมด {items.length} รายการ
      </p>

      <ul className="mt-4 divide-y divide-brand-100 rounded-xl bg-listing px-4 shadow-md">
        {items.map((item) => (
          <li key={item.id} className="flex items-center gap-3 py-3">
            <span className="w-6 shrink-0 text-sm md:text-base font-semibold text-gray-700">
              {item.quantity}
            </span>
            <span className="min-w-0 flex-1 truncate text-sm md:text-base font-semibold text-text">
              {item.menuItemName}
              {item.optionNames.length > 0 && (
                <span className="text-gray-500">
                  {' '}
                  ({item.optionNames.join(', ')})
                </span>
              )}
            </span>
            <span className="shrink-0 text-sm md:text-base font-semibold text-amount">
              {formatBaht(itemTotal(item))}
            </span>
          </li>
        ))}
      </ul>

      {cancelledCount > 0 && (
        <p className="mt-3 rounded-xl bg-danger/10 px-4 py-3 text-sm md:text-base text-danger">
          มี {cancelledCount} ออเดอร์ที่ถูกยกเลิก — ไม่ได้รวมอยู่ในยอดนี้
        </p>
      )}

      <div className="mt-4 flex items-center justify-between rounded-xl bg-brand-300 px-5 py-4 text-white shadow-md">
        <span className="text-lg md:text-xl font-bold">รวมสุทธิ</span>
        <span className="text-xl md:text-2xl font-bold">{formatBaht(total)}</span>
      </div>

      {checkout.isSuccess ? (
        <div className="mt-6 rounded-2xl border-2 border-success/40 bg-success/10 px-4 py-5 text-center">
          <p className="font-semibold text-success">
            แจ้งเช็คบิลเรียบร้อยแล้ว
          </p>
          <p className="mt-1 text-sm md:text-base text-gray-600">
            กรุณาชำระเงินที่เคาน์เตอร์
            {chosen === PaymentMethod.PROMPTPAY ? ' ด้วย PromptPay' : ' ด้วยเงินสด'}
          </p>
        </div>
      ) : (
        <>
          <p className="mt-6 text-sm md:text-base text-gray-600">เลือกวิธีชำระเงิน</p>
          <div className="mt-2 space-y-3 md:flex md:gap-3 md:space-y-0">
            <PaymentButton
              icon={<IconQr />}
              label="PromptPay (ชำระเงินที่เคาน์เตอร์)"
              disabled={checkout.isPending}
              onClick={() => {
                setChosen(PaymentMethod.PROMPTPAY)
                checkout.mutate({
                  token: token as string,
                  method: PaymentMethod.PROMPTPAY,
                })
              }}
            />
            <PaymentButton
              icon={<IconCash />}
              label="จ่ายเงินสด (ชำระเงินที่เคาน์เตอร์)"
              disabled={checkout.isPending}
              onClick={() => {
                setChosen(PaymentMethod.CASH)
                checkout.mutate({
                  token: token as string,
                  method: PaymentMethod.CASH,
                })
              }}
            />
          </div>
        </>
      )}

      {checkout.isError && (
        <p className="mt-3 text-sm md:text-base text-danger">{checkout.error.message}</p>
      )}
    </div>
  )
}

function PaymentButton({
  icon,
  label,
  disabled,
  onClick,
}: {
  icon: ReactNode
  label: string
  disabled: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="flex w-full items-center gap-3 rounded-xl bg-white px-4 py-4 text-left shadow-md transition hover:bg-brand-50 disabled:opacity-60"
    >
      <span aria-hidden className="text-brand-300">
        {icon}
      </span>
      <span className="text-sm md:text-base font-bold text-text">{label}</span>
    </button>
  )
}

function IconQr() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-6 w-6">
      <rect x="3" y="3" width="7" height="7" rx="1.5" />
      <rect x="14" y="3" width="7" height="7" rx="1.5" />
      <rect x="3" y="14" width="7" height="7" rx="1.5" />
      <path d="M14 14h3v3h-3zM20 14v3M14 20h6" strokeLinecap="round" />
    </svg>
  )
}

function IconCash() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-6 w-6">
      <rect x="2.5" y="6" width="19" height="12" rx="2" />
      <circle cx="12" cy="12" r="2.5" />
      <path d="M6 12h.01M18 12h.01" strokeLinecap="round" />
    </svg>
  )
}
