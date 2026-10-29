import { FoodImage } from '@/components/ui/FoodImage'
import { SearchInput } from '@/components/ui/SearchInput'
import {
  usePublicCategories,
  usePublicMenu,
  useSessionOrders,
} from '@/features/public/hooks'
import { cartCount, cartTotal, useCart } from '@/features/public/cart-store'
import { formatBaht } from '@/lib/format'
import { OrderStatus } from '@/types/enums'
import type { MenuItem } from '@/types/models'
import { useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'

export function CustomerMenuPage() {
  const { token } = useParams()
  const { data: categories } = usePublicCategories()
  const { data: items, isPending } = usePublicMenu()
  const lines = useCart((s) => s.lines)

  const [search, setSearch] = useState('')
  const [categoryId, setCategoryId] = useState<string | null>(null)

  const visible = useMemo(() => {
    const keyword = search.trim().toLowerCase()
    return (items ?? []).filter((item) => {
      const matchCategory = !categoryId || item.categoryId === categoryId
      const matchSearch = !keyword || item.name.toLowerCase().includes(keyword)
      return matchCategory && matchSearch
    })
  }, [items, search, categoryId])

  return (
    <div>
      <SearchInput
        value={search}
        onChange={setSearch}
        placeholder="ค้นหาเมนูอาหาร"
      />

      {/* หมวดหมู่ — ปัดซ้ายขวาได้ แต่ซ่อนแถบเลื่อน (ดูเป็น slider) ขอบขวาจางบอกว่ายังมีหมวดต่อ */}
      <div className="-mx-4 mt-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] [mask-image:linear-gradient(to_right,black_calc(100%-1.5rem),transparent)] [&::-webkit-scrollbar]:hidden">
        <CategoryChip
          active={categoryId === null}
          onClick={() => setCategoryId(null)}
        >
          ทั้งหมด
        </CategoryChip>
        {categories?.map((category) => (
          <CategoryChip
            key={category.id}
            active={categoryId === category.id}
            onClick={() => setCategoryId(category.id)}
          >
            {category.name}
          </CategoryChip>
        ))}
      </div>

      <ActiveOrderStrip token={token as string} />

      <h1 className="mt-5 text-lg font-bold text-ink md:text-xl">เมนูอาหาร</h1>

      {isPending && (
        <p className="mt-4 text-sm md:text-base text-gray-600">กำลังโหลดเมนู...</p>
      )}

      {!isPending && visible.length === 0 && (
        <p className="mt-10 text-center text-sm md:text-base text-gray-600">
          ไม่พบเมนูที่ค้นหา
        </p>
      )}

      {/* รายการเมนู */}
      <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-3 md:gap-4 lg:grid-cols-4">
        {visible.map((item) =>
          item.isAvailable ? (
            <Link
              key={item.id}
              to={`/t/${token}/menu/${item.id}`}
              className="group flex flex-col overflow-hidden rounded-2xl border-2 border-brand-50 bg-white transition hover:border-brand-75"
            >
              <MenuCardBody item={item} />
            </Link>
          ) : (
            // หมด = ไม่ใช่ลิงก์ (เดิมเป็นลิงก์ที่ปิดเมาส์ไว้ แต่ยัง Tab เข้าไปกด Enter ได้)
            <div
              key={item.id}
              aria-disabled="true"
              className="flex flex-col overflow-hidden rounded-2xl border-2 border-dashed border-gray-300 bg-gray-50"
            >
              <MenuCardBody item={item} />
            </div>
          ),
        )}
      </div>

      {/* แถบตะกร้าลอย — มือถือเท่านั้น (จอใหญ่มี badge บน nav อยู่แล้ว) */}
      {lines.length > 0 && (
        <Link
          to={`/t/${token}/cart`}
          className="fixed inset-x-4 bottom-[calc(4.75rem+env(safe-area-inset-bottom))] z-10 mx-auto flex h-15 max-w-[calc(28rem-2rem)] items-center gap-3 rounded-2xl bg-brand-500 px-4 text-white shadow-lg md:hidden"
        >
          <span className="flex h-8 min-w-8 items-center justify-center rounded-full bg-white px-1 text-sm font-bold text-brand-500 tabular-nums">
            {cartCount(lines)}
          </span>
          <span className="flex-1 text-base font-bold">ดูตะกร้า</span>
          <span className="text-lg font-bold tabular-nums">{formatBaht(cartTotal(lines))}</span>
        </Link>
      )}
    </div>
  )
}

function MenuCardBody({ item }: Readonly<{ item: MenuItem }>) {
  return (
    <>
      <div className="relative aspect-[4/3] w-full bg-brand-200">
        {/* absolute ไม่ให้ขนาดจริงของรูป (รูปแนวตั้ง) ดันกล่องสูงเกิน 4:3 — การ์ดทุกใบจะสูงเท่ากัน */}
        <div className="absolute inset-0 overflow-hidden">
          <FoodImage
            src={item.imageUrl}
            alt={item.name}
            className={item.isAvailable ? '' : 'opacity-50 grayscale'}
          />
        </div>
        {item.isAvailable ? (
          <span
            aria-hidden
            className="absolute right-2 -bottom-5 flex h-10 w-10 items-center justify-center rounded-full border-[3px] border-white bg-brand-500 text-white transition group-hover:scale-105"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="h-5 w-5">
              <path d="M12 5v14M5 12h14" strokeLinecap="round" />
            </svg>
          </span>
        ) : (
          <span className="absolute top-2 left-2 rounded-full bg-danger-ink px-2.5 py-0.5 text-xs font-bold text-white">
            หมดชั่วคราว
          </span>
        )}
      </div>

      <div className="min-w-0 px-3 pt-3 pb-3 pr-12">
        <p className="truncate text-sm font-bold text-ink md:text-base">{item.name}</p>
        <p
          className={`text-base font-bold tabular-nums ${
            item.isAvailable ? 'text-price' : 'text-gray-600 line-through'
          }`}
        >
          {formatBaht(item.price)}
        </p>
      </div>
    </>
  )
}

/**
 * แถบบอกสถานะออเดอร์ที่ยังไม่เสิร์ฟ — ลูกค้ากลับมาหน้าเมนูเพื่อสั่งเพิ่ม
 * ยังเห็นว่าของที่สั่งไปถึงไหนแล้ว โดยไม่ต้องสลับไปหน้าสถานะ
 */
function ActiveOrderStrip({ token }: Readonly<{ token: string }>) {
  const { data: orders } = useSessionOrders(token)
  const waiting = (orders ?? []).filter(
    (o) => o.status === OrderStatus.PENDING || o.status === OrderStatus.PREPARING,
  )
  if (waiting.length === 0) return null

  const cooking = waiting.some((o) => o.status === OrderStatus.PREPARING)
  const label = cooking ? 'กำลังปรุง' : 'ครัวรับออเดอร์แล้ว'

  return (
    <Link
      to={`/t/${token}/status`}
      className="mt-4 flex min-h-12 items-center gap-3 rounded-2xl border-2 border-brand-75 bg-brand-50 px-3 py-2 text-ink"
    >
      <span
        aria-hidden
        className={`h-2.5 w-2.5 shrink-0 rounded-full ${cooking ? 'bg-status-cooking' : 'bg-status-queue'}`}
      />
      <span className="flex-1 text-sm font-semibold">
        {waiting.length > 1 ? `${waiting.length} ออเดอร์ · ` : ''}
        {label}
      </span>
      <span className="text-sm font-bold text-brand-500">ดูสถานะ</span>
    </Link>
  )
}

function CategoryChip({
  active,
  onClick,
  children,
}: Readonly<{
  active: boolean
  onClick: () => void
  children: string
}>) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`min-h-11 shrink-0 rounded-full border-2 px-5 text-sm md:text-base font-bold transition ${
        active
          ? 'border-brand-500 bg-brand-500 text-white'
          : 'border-brand-100 bg-white text-brand-500 hover:bg-brand-50'
      }`}
    >
      {children}
    </button>
  )
}
