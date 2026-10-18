import { FoodImage } from '@/components/ui/FoodImage'
import { SearchInput } from '@/components/ui/SearchInput'
import {
  usePublicCategories,
  usePublicMenu,
} from '@/features/public/hooks'
import { cartCount, cartTotal, useCart } from '@/features/public/cart-store'
import { formatBaht } from '@/lib/format'
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

      {/* หมวดหมู่ */}
      <div className="-mx-4 mt-4 flex gap-2 overflow-x-auto px-4 pb-1">
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

      {/* แบนเนอร์ */}
      <div className="mt-4 overflow-hidden rounded-2xl bg-gradient-to-r from-brand-300 to-brand-200 px-5 py-6 text-white md:px-8 md:py-10">
        <p className="text-sm md:text-base font-medium opacity-90">ยินดีต้อนรับ</p>
        <p className="text-2xl md:text-3xl leading-tight font-bold md:text-3xl">
          ร้านอาหาร
          <br />
          ตามสั่ง
        </p>
      </div>

      {isPending && (
        <p className="mt-6 text-sm md:text-base text-gray-500">กำลังโหลดเมนู...</p>
      )}

      {!isPending && visible.length === 0 && (
        <p className="mt-10 text-center text-sm md:text-base text-gray-500">
          ไม่พบเมนูที่ค้นหา
        </p>
      )}

      {/* รายการเมนู */}
      <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-3 md:gap-4 lg:grid-cols-4">
        {visible.map((item) => (
          <Link
            key={item.id}
            to={`/t/${token}/menu/${item.id}`}
            className={`group overflow-hidden rounded-xl bg-brand-200 shadow-md transition hover:brightness-105 ${
              item.isAvailable ? '' : 'pointer-events-none'
            }`}
          >
            <div className="aspect-[169/163] w-full overflow-hidden">
              <FoodImage
                src={item.imageUrl}
                alt={item.name}
                className={item.isAvailable ? '' : 'opacity-60'}
              />
            </div>

            <div className="flex items-end justify-between gap-2 px-2.5 pt-2 pb-2.5">
              <div className="min-w-0">
                <p className="truncate text-sm md:text-base font-semibold text-ink">
                  {item.name}
                </p>
                <p className="text-sm md:text-base font-semibold text-price">
                  {item.isAvailable ? formatBaht(item.price) : 'หมดชั่วคราว'}
                </p>
              </div>

              {item.isAvailable && (
                <span
                  aria-hidden
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-2xl bg-white text-xl leading-none font-bold text-brand-400 md:h-10 md:w-10 md:text-2xl"
                >
                  +
                </span>
              )}
            </div>
          </Link>
        ))}
      </div>

      {/* แถบตะกร้าลอย — มือถือเท่านั้น (จอใหญ่มี badge บน nav อยู่แล้ว) */}
      {lines.length > 0 && (
        <Link
          to={`/t/${token}/cart`}
          className="fixed inset-x-0 bottom-16 z-10 mx-auto flex max-w-md items-center justify-between bg-brand-300 px-4 py-3 text-white shadow-lg md:hidden"
        >
          <span className="text-sm md:text-base font-medium">
            เลือกแล้ว {cartCount(lines)} รายการ
          </span>
          <span className="font-bold">{formatBaht(cartTotal(lines))}</span>
        </Link>
      )}
    </div>
  )
}

function CategoryChip({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`shrink-0 rounded-full px-6 py-2.5 text-sm md:text-base font-bold shadow-sm transition ${
        active
          ? 'bg-brand-300 text-white'
          : 'bg-brand-100 text-brand-500 hover:bg-brand-75'
      }`}
    >
      {children}
    </button>
  )
}
