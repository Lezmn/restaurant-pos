import {
  useRequestCheckout,
  useSession,
  useSessionOrders,
} from '@/features/public/hooks'
import { Modal } from '@/components/ui/Modal'
import { formatBaht } from '@/lib/format'
import { itemTotal, orderTotal } from '@/features/orders/order-total'
import { OrderStatus } from '@/types/enums'
import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'

export function CustomerBillPage() {
  const { token } = useParams()
  const { data: session } = useSession(token)
  const { data: orders, isPending } = useSessionOrders(token)
  const checkout = useRequestCheckout()
  /** กดปุ่มแล้ว รอยืนยันใน popup */
  const [confirming, setConfirming] = useState(false)
  // แจ้งได้รอบเดียว: กดสำเร็จในหน้านี้ หรือ session บอกว่ามีคำขอค้างอยู่ (รีเฟรช/เปิดเครื่องอื่น)
  const requested = checkout.isSuccess || Boolean(session?.checkoutRequested)

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

      {requested ? (
        <div className="mt-6 rounded-2xl border-2 border-success/40 bg-success/10 px-4 py-5 text-center">
          <p className="font-semibold text-success">แจ้งพนักงานแล้วว่าต้องการชำระเงิน</p>
          <p className="mt-1 text-sm md:text-base text-gray-600">กรุณาชำระเงินที่เคาน์เตอร์</p>
        </div>
      ) : (
        // กดแล้วยังไม่ได้จ่าย — แค่แจ้งพนักงานว่าโต๊ะนี้พร้อมจ่าย วิธีจ่ายค่อยบอกที่เคาน์เตอร์
        <button
          type="button"
          onClick={() => setConfirming(true)}
          disabled={checkout.isPending}
          className="mt-6 flex min-h-14 w-full items-center justify-center gap-3 rounded-xl border-2 border-brand-300 bg-white px-4 py-4 shadow-md transition hover:bg-brand-50 disabled:opacity-60"
        >
          <span aria-hidden className="text-brand-300">
            <IconBill />
          </span>
          <span className="text-base md:text-lg font-bold text-text">แจ้งชำระเงิน</span>
        </button>
      )}

      {/* ยืนยันอีกครั้งกันกดพลาด — แจ้งแล้วกดซ้ำไม่ได้ */}
      {confirming && !requested && (
        <Modal title="ยืนยันการแจ้งชำระเงิน" onClose={() => setConfirming(false)}>
          <p className="text-base text-gray-700">
            แจ้งพนักงานว่า{session ? `โต๊ะ ${session.tableName} ` : ''}ต้องการชำระเงิน ใช่ไหม?
          </p>
          <p className="mt-2 text-2xl font-bold text-amount tabular-nums">{formatBaht(total)}</p>
          <p className="mt-2 text-sm text-gray-500">แจ้งได้ครั้งเดียว ถ้าจะสั่งเพิ่ม ให้สั่งก่อนกดยืนยัน</p>
          <div className="mt-5 flex gap-3">
            <button
              type="button"
              onClick={() => setConfirming(false)}
              className="min-h-12 flex-1 rounded-full border-2 border-gray-300 px-4 text-base font-bold text-gray-700 transition hover:bg-gray-50"
            >
              ยกเลิก
            </button>
            <button
              type="button"
              disabled={checkout.isPending}
              onClick={() =>
                checkout.mutate({ token: token as string }, { onSettled: () => setConfirming(false) })
              }
              className="min-h-12 flex-1 rounded-full bg-brand-300 px-4 text-base font-bold text-white transition hover:bg-brand-400 disabled:opacity-60"
            >
              {checkout.isPending ? 'กำลังแจ้ง…' : 'ยืนยัน'}
            </button>
          </div>
        </Modal>
      )}

      {checkout.isError && (
        <p className="mt-3 text-sm md:text-base text-danger">{checkout.error.message}</p>
      )}
    </div>
  )
}

function IconBill() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-6 w-6">
      <path d="M6 3h12v18l-3-2-3 2-3-2-3 2V3Z" strokeLinejoin="round" />
      <path d="M9 8h6M9 12h6" strokeLinecap="round" />
    </svg>
  )
}
