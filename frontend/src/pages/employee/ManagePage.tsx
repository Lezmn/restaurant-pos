import { FoodImage } from '@/components/ui/FoodImage'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { ErrorNote } from '@/components/ui/ErrorNote'
import { LoadError } from '@/components/ui/LoadError'
import { Switch } from '@/components/ui/Switch'
import { button, field } from '@/components/ui/styles'
import {
  useCategories,
  useCreateMenuItem,
  useCreateMenuOption,
  useDeleteMenuItem,
  useMenuItems,
  useSetMenuItemAvailability,
  useUpdateMenuItem,
} from '@/features/menu/hooks'
import type { MenuItem } from '@/types/models'
import { IngredientsPanel } from './IngredientsPanel'
import { MenuFormDialog } from './MenuFormDialog'
import { formatBaht } from '@/lib/format'
import { useMemo, useState, type ReactNode } from 'react'

type Tab = 'menu' | 'ingredient'

export function ManagePage() {
  const itemsQuery = useMenuItems()
  const items = itemsQuery.data
  const { data: categories } = useCategories()
  const setAvailability = useSetMenuItemAvailability()
  const createItem = useCreateMenuItem()
  const createOption = useCreateMenuOption()
  const updateItem = useUpdateMenuItem()
  const deleteItem = useDeleteMenuItem()

  const [tab, setTab] = useState<Tab>('menu')
  const [search, setSearch] = useState('')
  /** '' = ทุกหมวด */
  const [categoryId, setCategoryId] = useState('')
  /** ครัวเข้าหน้านี้บ่อยสุดเพื่อดู/เปิดเมนูที่หมดกลับ — กรองให้เหลือแค่ตัวที่ปิดขายอยู่ */
  const [onlySoldOut, setOnlySoldOut] = useState(false)
  /** null = ปิดฟอร์ม, 'new' = เพิ่มใหม่, object = แก้ไขเมนูนั้น */
  const [editing, setEditing] = useState<MenuItem | 'new' | null>(null)
  /** เมนูที่กำลังถามยืนยันว่าจะลบ — null = ไม่มีกล่องเปิดอยู่ */
  const [deleting, setDeleting] = useState<MenuItem | null>(null)

  const categoryName = useMemo(
    () => new Map((categories ?? []).map((c) => [c.id, c.name])),
    [categories],
  )

  const visible = useMemo(() => {
    const keyword = search.trim().toLowerCase()
    return (items ?? []).filter(
      (i) =>
        (!categoryId || i.categoryId === categoryId) &&
        (!onlySoldOut || !i.isAvailable) &&
        (!keyword || i.name.toLowerCase().includes(keyword)),
    )
  }, [items, search, categoryId, onlySoldOut])

  /** จำนวนเมนูต่อหมวด ไว้โชว์ท้ายชื่อชิป */
  const countByCategory = useMemo(() => {
    const counts = new Map<string, number>()
    for (const i of items ?? []) {
      counts.set(i.categoryId, (counts.get(i.categoryId) ?? 0) + 1)
    }
    return counts
  }, [items])

  const soldOutCount = (items ?? []).filter((i) => !i.isAvailable).length
  const itemsFailed = itemsQuery.isError && !items

  return (
    <div className="mx-auto max-w-7xl">
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
        <div>
          <h1 className="text-2xl font-bold text-black">จัดการเมนู</h1>
          {items && (
            <p className="mt-1 text-base text-gray-600">
              {items.length} เมนู
              {soldOutCount > 0 && (
                <>
                  {' · '}
                  <b className="text-danger-ink">ปิดขายอยู่ {soldOutCount}</b>
                </>
              )}
            </p>
          )}
        </div>
        {tab === 'menu' && (
          <button
            type="button"
            onClick={() => setEditing('new')}
            className={button('primary', 'lg')}
          >
            เพิ่มเมนู
          </button>
        )}
      </div>

      {/* แท็บเมนู/วัตถุดิบ + ค้นหา */}
      <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div
          role="group"
          aria-label="เลือกสิ่งที่จะจัดการ"
          className="inline-flex self-start rounded-lg bg-gray-100 p-1"
        >
          <Segment active={tab === 'menu'} onClick={() => setTab('menu')}>
            เมนู
          </Segment>
          <Segment active={tab === 'ingredient'} onClick={() => setTab('ingredient')}>
            วัตถุดิบ
          </Segment>
        </div>

        {tab === 'menu' && (
          <label className="relative block w-full sm:w-72">
            <span className="sr-only">ค้นหาเมนู</span>
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              aria-hidden
              className="pointer-events-none absolute top-1/2 left-3 h-5 w-5 -translate-y-1/2 text-gray-600"
            >
              <circle cx="11" cy="11" r="7" />
              <path d="m20 20-3.5-3.5" strokeLinecap="round" />
            </svg>
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="ค้นหาเมนู"
              className={`${field} mt-0 pl-10`}
            />
          </label>
        )}
      </div>

      {tab === 'ingredient' ? (
        <IngredientsPanel />
      ) : (
        <>
          {/* หมวดหมู่ + ตัวกรองเมนูที่หมด — กดเพื่อกรอง ใช้ร่วมกับช่องค้นหาได้ */}
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <Chip active={categoryId === ''} onClick={() => setCategoryId('')}>
              ทั้งหมด <Count>{items?.length ?? 0}</Count>
            </Chip>
            {categories?.map((c) => (
              <Chip
                key={c.id}
                active={categoryId === c.id}
                onClick={() => setCategoryId(c.id)}
              >
                {c.name} <Count>{countByCategory.get(c.id) ?? 0}</Count>
              </Chip>
            ))}

            <span aria-hidden className="mx-1 hidden h-6 w-px bg-gray-300 sm:block" />

            <Chip
              active={onlySoldOut}
              tone="danger"
              onClick={() => setOnlySoldOut((v) => !v)}
            >
              เฉพาะที่ปิดขาย <Count>{soldOutCount}</Count>
            </Chip>
          </div>

          <div className="mt-5">
            {itemsQuery.isError && (
              <LoadError
                what="รายการเมนู"
                stale={Boolean(items)}
                onRetry={() => itemsQuery.refetch()}
              />
            )}
            <ErrorNote error={setAvailability.error ?? deleteItem.error} />

            {itemsQuery.isPending && (
              <div aria-hidden className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
                {[0, 1, 2, 3].map((i) => (
                  <div key={i} className="aspect-[3/4] animate-pulse rounded-xl bg-gray-100" />
                ))}
              </div>
            )}

            {!itemsQuery.isPending && !itemsFailed && visible.length === 0 && (
              <p className="rounded-xl border-2 border-gray-200 px-6 py-10 text-center text-base text-gray-600">
                {onlySoldOut && !search.trim()
                  ? 'ไม่มีเมนูที่ปิดขายอยู่ ทุกเมนูพร้อมขาย'
                  : categoryId && !search.trim()
                    ? 'หมวดนี้ยังไม่มีเมนู กด "เพิ่มเมนู" แล้วเลือกหมวดนี้ได้เลย'
                    : 'ไม่พบเมนูที่ค้นหา'}
              </p>
            )}

            <ul className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-6">
              {visible.map((item) => {
                const busy =
                  setAvailability.isPending &&
                  setAvailability.variables?.id === item.id
                return (
                  <li key={item.id} className="flex">
                    <MenuCard
                      item={item}
                      category={categoryName.get(item.categoryId)}
                      busy={busy}
                      onToggle={(next) =>
                        setAvailability.mutate({ id: item.id, isAvailable: next })
                      }
                      onEdit={() => setEditing(item)}
                    />
                  </li>
                )
              })}
            </ul>
          </div>
        </>
      )}

      {editing === 'new' && (
        <MenuFormDialog
          isSaving={createItem.isPending}
          error={createItem.error}
          onCancel={() => setEditing(null)}
          onSubmit={(input, pendingOptions) =>
            createItem.mutate(input, {
              onSuccess: async (created) => {
                // ตัวเลือกต้องมี id เมนูก่อน จึงสร้างต่อจากเมนูทีละตัวตามลำดับที่ผู้ใช้ใส่
                for (const option of pendingOptions) {
                  await createOption.mutateAsync({ menuItemId: created.id, input: option })
                }
                setEditing(null)
              },
            })
          }
        />
      )}

      {editing && editing !== 'new' && (
        <MenuFormDialog
          item={editing}
          isSaving={updateItem.isPending}
          error={updateItem.error}
          onCancel={() => setEditing(null)}
          // ลบอยู่ในฟอร์มแก้ไข ไม่ได้อยู่บนการ์ด — ครัวกดสวิตช์บ่อย ปุ่มลบไม่ควรอยู่ใกล้มือ
          onDelete={() => {
            setDeleting(editing)
            setEditing(null)
          }}
          onSubmit={(input) =>
            updateItem.mutate(
              { id: editing.id, input },
              { onSuccess: () => setEditing(null) },
            )
          }
        />
      )}

      {deleting && (
        <ConfirmDialog
          title="ลบเมนู"
          subject={deleting.name}
          detail={formatBaht(deleting.price)}
          consequence="ถ้าเมนูนี้เคยถูกสั่งไปแล้วจะลบไม่ได้ ให้ปิดขายแทนเพื่อซ่อนจากลูกค้า"
          confirmLabel="ลบเมนู"
          pendingLabel="กำลังลบ..."
          isPending={deleteItem.isPending}
          error={deleteItem.error}
          onCancel={() => {
            deleteItem.reset()
            setDeleting(null)
          }}
          onConfirm={() =>
            deleteItem.mutate(deleting.id, {
              onSuccess: () => setDeleting(null),
            })
          }
        />
      )}
    </div>
  )
}

/** การ์ดเมนู — งานหลักคือเปิด/ปิดขาย สวิตช์จึงใหญ่และอยู่ตรงกลาง ปุ่มแก้ไขเป็นปุ่มรองด้านล่าง */
function MenuCard({
  item,
  category,
  busy,
  onToggle,
  onEdit,
}: {
  item: MenuItem
  category: string | undefined
  busy: boolean
  onToggle: (next: boolean) => void
  onEdit: () => void
}) {
  const soldOut = !item.isAvailable

  return (
    <article
      className={`flex w-full flex-col overflow-hidden rounded-xl border-2 ${
        soldOut ? 'border-gray-300 bg-gray-50' : 'border-gray-200 bg-white'
      }`}
    >
      <div className="relative aspect-[4/3] w-full overflow-hidden bg-brand-50">
        <FoodImage
          src={item.imageUrl}
          alt={item.name}
          className={soldOut ? 'opacity-50 grayscale' : ''}
        />
        {soldOut && (
          <span className="absolute top-2 left-2 rounded-full bg-black/85 px-3 py-1 text-sm font-bold text-white">
            ปิดขาย
          </span>
        )}
      </div>

      <div className="flex flex-1 flex-col p-3">
        <div className="flex items-start justify-between gap-2">
          <h2 className="line-clamp-2 text-base font-bold text-black">{item.name}</h2>
          <p className="shrink-0 text-base font-bold text-black tabular-nums">
            {formatBaht(item.price)}
          </p>
        </div>
        {category && <p className="text-sm text-gray-600">{category}</p>}

        <div className="mt-auto pt-3">
          <div className="flex items-center justify-between gap-2 border-t border-gray-200 pt-2">
            <span
              className={`text-sm font-bold ${soldOut ? 'text-danger-ink' : 'text-black'}`}
            >
              {busy ? 'กำลังบันทึก...' : soldOut ? 'ปิดขาย' : 'เปิดขาย'}
            </span>
            <Switch
              checked={item.isAvailable}
              label={`เปิดขาย ${item.name}`}
              busy={busy}
              onChange={onToggle}
            />
          </div>

          <button
            type="button"
            onClick={onEdit}
            className={`${button('outline', 'sm')} mt-2 w-full`}
          >
            แก้ไข
          </button>
        </div>
      </div>
    </article>
  )
}

function Count({ children }: { children: ReactNode }) {
  return <span className="font-normal tabular-nums opacity-80">({children})</span>
}

/** ชิปกรอง — ขอบ 2px ทุกสถานะ ขนาดไม่กระโดดตอนเลือก */
function Chip({
  active,
  tone = 'brand',
  onClick,
  children,
}: {
  active: boolean
  tone?: 'brand' | 'danger'
  onClick: () => void
  children: ReactNode
}) {
  const on =
    tone === 'danger'
      ? 'border-danger-ink bg-danger-ink text-white'
      : 'border-brand-500 bg-brand-500 text-white'
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={`min-h-11 rounded-full border-2 px-4 text-sm font-bold transition ${
        active ? on : 'border-gray-200 bg-white text-gray-700 hover:border-brand-400'
      }`}
    >
      {children}
    </button>
  )
}

/** ตัวสลับแท็บแบบ segmented — สองตัวเลือกที่แยกกันชัด ไม่ใช่ปุ่มแยกสองปุ่ม */
function Segment({
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
      aria-pressed={active}
      onClick={onClick}
      className={`min-h-11 rounded-md px-6 text-base font-bold transition ${
        active ? 'bg-brand-500 text-white' : 'text-gray-700 hover:bg-white'
      }`}
    >
      {children}
    </button>
  )
}
