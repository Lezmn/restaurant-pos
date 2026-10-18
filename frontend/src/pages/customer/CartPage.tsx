import { FoodImage } from '@/components/ui/FoodImage'
import { QuantityStepper } from '@/components/ui/QuantityStepper'
import {
  cartCount,
  cartTotal,
  lineTotal,
  useCart,
} from '@/features/public/cart-store'
import { useSession, useSubmitOrder } from '@/features/public/hooks'
import { formatBaht } from '@/lib/format'
import { Link, useNavigate, useParams } from 'react-router-dom'

export function CustomerCartPage() {
  const { token } = useParams()
  const navigate = useNavigate()
  const { data: session } = useSession(token)
  const lines = useCart((s) => s.lines)
  const setQuantity = useCart((s) => s.setQuantity)
  const clear = useCart((s) => s.clear)
  const submit = useSubmitOrder(token)

  if (lines.length === 0) {
    return (
      <div className="py-16 text-center">
        <p className="text-sm md:text-base text-gray-500">ยังไม่มีรายการที่เลือก</p>
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
    <div className="lg:grid lg:grid-cols-[1fr_20rem] lg:items-start lg:gap-6">
      <div>
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-xl md:text-2xl font-bold text-black">รายการอาหาร</h1>
            <p className="text-sm md:text-base text-gray-500">
              {session ? `โต๊ะ ${session.tableName} : ` : ''}
              ทั้งหมด {cartCount(lines)} รายการ
            </p>
          </div>
          <button
            type="button"
            onClick={clear}
            className="shrink-0 text-sm md:text-base font-semibold text-accent-pink"
          >
            ยกเลิกทั้งหมด
          </button>
        </div>

        <ul className="mt-4 space-y-3">
          {lines.map((line) => (
            <li
              key={line.lineId}
              className="flex gap-3 overflow-hidden rounded-xl bg-listing shadow-md"
            >
              <div className="h-24 w-24 shrink-0 overflow-hidden bg-white">
                <FoodImage src={line.imageUrl} alt={line.name} />
              </div>

              <div className="flex min-w-0 flex-1 flex-col justify-between py-2 pr-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm md:text-base font-semibold text-text">
                      {line.name}
                    </p>
                    {line.options.length > 0 && (
                      <p className="truncate text-xs md:text-sm text-gray-500">
                        {line.options.map((o) => o.name).join(', ')}
                      </p>
                    )}
                    {line.note && (
                      <p className="truncate text-xs md:text-sm text-brand-400">
                        {line.note}
                      </p>
                    )}
                  </div>
                  <p className="shrink-0 text-sm md:text-base font-semibold text-amount">
                    {formatBaht(lineTotal(line))}
                  </p>
                </div>

                <div className="flex justify-end">
                  <QuantityStepper
                    size="sm"
                    min={0}
                    value={line.quantity}
                    onChange={(next) => setQuantity(line.lineId, next)}
                  />
                </div>
              </div>
            </li>
          ))}
        </ul>
      </div>

      {/* สรุปยอด */}
      <div className="mt-5 rounded-xl bg-brand-200 p-4 shadow-md lg:sticky lg:top-24 lg:mt-0">
        <div className="flex items-center justify-between px-2 pb-3 text-white">
          <span className="font-bold">ยอดรวมรายการอาหาร</span>
          <span className="text-lg md:text-xl font-bold">{formatBaht(cartTotal(lines))}</span>
        </div>

        <button
          type="button"
          disabled={submit.isPending}
          onClick={() =>
            submit.mutate(
              { token: token as string, lines },
              { onSuccess: () => navigate(`/t/${token}/status`) },
            )
          }
          className="w-full rounded-xl bg-white py-3 text-base md:text-lg font-bold text-qty transition disabled:opacity-60"
        >
          {submit.isPending ? 'กำลังส่ง...' : '➤ ส่งรายการเข้าครัว'}
        </button>

        {submit.isError && (
          <p role="alert" className="mt-2 px-2 text-sm md:text-base font-semibold text-white">
            {submit.error.message}
          </p>
        )}
      </div>
    </div>
  )
}
