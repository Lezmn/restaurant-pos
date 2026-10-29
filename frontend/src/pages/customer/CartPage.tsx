import { FoodImage } from '@/components/ui/FoodImage'
import { QuantityStepper } from '@/components/ui/QuantityStepper'
import {
  cartCount,
  cartTotal,
  lineTotal,
  unavailableLineIds,
  useCart,
} from '@/features/public/cart-store'
import { usePublicMenu, useSession, useSubmitOrder } from '@/features/public/hooks'
import { formatBaht } from '@/lib/format'
import { useEffect, useRef } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'

export function CustomerCartPage() {
  const { token } = useParams()
  const navigate = useNavigate()
  const { data: session } = useSession(token)
  const lines = useCart((s) => s.lines)
  const setQuantity = useCart((s) => s.setQuantity)
  const remove = useCart((s) => s.remove)
  const clear = useCart((s) => s.clear)
  const syncPrices = useCart((s) => s.syncPrices)
  const submit = useSubmitOrder(token)
  // เมนู refetch เองเมื่อมี menu.updated — ราคาในตะกร้าต้องตามให้ตรงกับที่ backend จะคิดจริง
  const { data: menu } = usePublicMenu()
  const repriced = useCart((s) => s.repriced)

  useEffect(() => {
    if (menu) syncPrices(menu)
  }, [menu, lines, syncPrices])
  // ปิดขาย/ของหมดระหว่างอยู่ในตะกร้า — ส่งไป backend จะปฏิเสธทั้งออเดอร์ ต้องเอาออกก่อน
  const unavailable = menu ? unavailableLineIds(lines, menu) : new Set<string>()
  // isPending ยังไม่ทันเป็น true ตอนแตะครั้งที่สอง (state อัปเดตหลัง render) — ล็อกแบบ sync กันออเดอร์ซ้ำ
  const sending = useRef(false)

  const send = () => {
    if (sending.current) return
    sending.current = true
    submit.mutate(
      { token: token as string, lines },
      {
        onSuccess: () => navigate(`/t/${token}/status`),
        onSettled: () => {
          sending.current = false
        },
      },
    )
  }

  if (lines.length === 0) {
    return (
      <div className="py-16 text-center">
        <p className="text-sm md:text-base text-gray-500">ยังไม่มีรายการที่เลือก</p>
        <Link
          to={`/t/${token}`}
          className="mt-4 inline-flex min-h-12 items-center rounded-2xl bg-brand-500 px-6 text-sm md:text-base font-bold text-white"
        >
          เลือกเมนู
        </Link>
      </div>
    )
  }

  return (
    <div className="lg:grid lg:grid-cols-[1fr_20rem] lg:items-start lg:gap-6">
      <div>
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-xl md:text-2xl font-bold text-ink">รายการอาหาร</h1>
            <p className="text-sm md:text-base text-gray-600">
              {session ? `โต๊ะ ${session.tableName} : ` : ''}
              ทั้งหมด {cartCount(lines)} รายการ
            </p>
          </div>
          <button
            type="button"
            onClick={clear}
            // ตัวหนังสือเล็กเท่าเดิม แต่พื้นที่กดสูง 44px เท่าปุ่มอื่น (-mr-2 ชดเชย padding ให้ขอบขวาตรงเดิม)
            className="-mr-2 inline-flex min-h-11 shrink-0 items-center px-2 text-sm md:text-base font-bold text-danger-ink"
          >
            ยกเลิกทั้งหมด
          </button>
        </div>

        {repriced.length > 0 && (
          <output className="mt-4 block rounded-xl border-2 border-brand-300 bg-brand-50 px-4 py-3 text-sm md:text-base font-semibold text-text">
            ราคา {repriced.join(', ')} มีการเปลี่ยนแปลง — ยอดด้านล่างเป็นราคาล่าสุดแล้ว
          </output>
        )}

        <ul className="mt-4 space-y-3">
          {lines.map((line) => (
            <li
              key={line.lineId}
              className={`flex gap-3 rounded-2xl p-3 ${
                unavailable.has(line.lineId)
                  ? 'border-2 border-dashed border-danger/50 bg-white'
                  : 'bg-listing'
              }`}
            >
              <div className="h-20 w-20 shrink-0 overflow-hidden rounded-xl bg-white">
                <FoodImage src={line.imageUrl} alt={line.name} />
              </div>

              <div className="flex min-w-0 flex-1 flex-col justify-between gap-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm md:text-base font-bold text-ink">
                      {line.name}
                    </p>
                    {line.options.length > 0 && (
                      <p className="truncate text-xs md:text-sm text-gray-600">
                        {line.options.map((o) => o.name).join(', ')}
                      </p>
                    )}
                    {line.note && (
                      <p className="truncate text-xs md:text-sm font-semibold text-brand-500">
                        {line.note}
                      </p>
                    )}
                    {unavailable.has(line.lineId) && (
                      <p className="text-xs md:text-sm font-bold text-danger-ink">
                        หมดชั่วคราว
                      </p>
                    )}
                  </div>
                  <p className="shrink-0 text-sm md:text-base font-bold text-amount tabular-nums">
                    {formatBaht(lineTotal(line))}
                  </p>
                </div>

                <div className="flex justify-end">
                  {unavailable.has(line.lineId) ? (
                    <button
                      type="button"
                      onClick={() => remove(line.lineId)}
                      className="min-h-10 rounded-xl border-2 border-danger-ink px-4 text-sm font-bold text-danger-ink"
                    >
                      เอาออก
                    </button>
                  ) : (
                    <QuantityStepper
                      size="sm"
                      min={0}
                      value={line.quantity}
                      onChange={(next) => setQuantity(line.lineId, next)}
                    />
                  )}
                </div>
              </div>
            </li>
          ))}
        </ul>

        <Link
          to={`/t/${token}`}
          className="mt-3 flex min-h-12 items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-brand-100 text-sm font-bold text-brand-500 hover:bg-brand-50 md:text-base"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden className="h-4 w-4">
            <path d="M12 5v14M5 12h14" strokeLinecap="round" />
          </svg>
          สั่งเมนูอื่นเพิ่ม
        </Link>
      </div>

      {/* สรุปยอด */}
      <div className="mt-5 rounded-2xl border-2 border-brand-75 bg-white p-4 lg:sticky lg:top-24 lg:mt-0">
        <div className="flex items-baseline justify-between pb-3">
          <span className="font-bold text-ink">ยอดรวมรายการอาหาร</span>
          <span className="text-2xl md:text-3xl font-bold text-amount tabular-nums">
            {formatBaht(cartTotal(lines))}
          </span>
        </div>

        <button
          type="button"
          disabled={submit.isPending || unavailable.size > 0}
          onClick={send}
          className="flex min-h-14 w-full items-center justify-center gap-2 rounded-2xl bg-brand-500 text-base md:text-lg font-bold text-white transition active:scale-[0.98] disabled:bg-gray-200 disabled:text-gray-600"
        >
          {!submit.isPending && (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden className="h-5 w-5">
              <path d="M4 12l16-8-6 16-2-6z" strokeLinejoin="round" />
            </svg>
          )}
          {submit.isPending ? 'กำลังส่ง...' : 'ส่งรายการเข้าครัว'}
        </button>

        <p className="mt-3 text-xs text-gray-600 md:text-sm">
          ส่งแล้วครัวเริ่มทำทันที แก้รายการเองไม่ได้ ถ้าต้องเปลี่ยนให้กดเรียกพนักงาน · จ่ายเงินตอนเช็คบิล
        </p>

        {unavailable.size > 0 && (
          <p role="alert" className="mt-2 text-sm md:text-base font-bold text-danger-ink">
            มีรายการที่หมดชั่วคราว — กด "เอาออก" ก่อนส่งเข้าครัว
          </p>
        )}

        {submit.isError && (
          <p role="alert" className="mt-2 text-sm md:text-base font-bold text-danger-ink">
            {submit.error.message}
          </p>
        )}
      </div>
    </div>
  )
}
