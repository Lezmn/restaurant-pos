import { FoodImage } from '@/components/ui/FoodImage'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { ErrorNote } from '@/components/ui/ErrorNote'
import { LoadError } from '@/components/ui/LoadError'
import { Switch } from '@/components/ui/Switch'
import { toast } from '@/components/ui/toast'
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
import type { Id, MenuItem } from '@/types/models'
import { IngredientsPanel } from './IngredientsPanel'
import { MenuFormDialog } from './MenuFormDialog'
import { formatBaht } from '@/lib/format'
import { useSlashFocus } from '@/lib/use-slash-focus'
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'

type Tab = 'menu' | 'ingredient'

/**
 * กดสวิตช์เปิด/ปิดขายรัว ๆ — สวิตช์เปลี่ยนทันที แต่รอให้หยุดกดเท่านี้ก่อนค่อยบันทึกสถานะสุดท้ายครั้งเดียว
 * เดิมกดทีละครั้งยิง API ทุกครั้ง กดถี่ ๆ จนโดน rate limit (429) แล้วทั้งหน้าโหลดเมนูไม่ได้ไปเกือบนาที
 */
const TOGGLE_DELAY_MS = 600

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
  const searchRef = useRef<HTMLInputElement>(null)
  useSlashFocus(searchRef)
  /** '' = ทุกหมวด */
  const [categoryId, setCategoryId] = useState('')
  /** ครัวเข้าหน้านี้บ่อยสุดเพื่อดู/เปิดเมนูที่หมดกลับ — กรองให้เหลือแค่ตัวที่ปิดขายอยู่ */
  const [onlySoldOut, setOnlySoldOut] = useState(false)
  /** โหมดเลือกหลายเมนู (วัตถุดิบหมดทีเดียวหลายจาน) — null = ไม่ได้อยู่ในโหมดเลือก */
  const [selected, setSelected] = useState<Set<Id> | null>(null)
  /** เมนูที่กำลังบันทึกสถานะอยู่ — ล็อกเฉพาะตัวเหล่านี้ */
  const [busyIds, setBusyIds] = useState<Set<Id>>(new Set())
  /** สถานะที่กดไว้แต่ยังรอบันทึก (ระหว่าง TOGGLE_DELAY_MS) — สวิตช์โชว์ค่านี้ก่อนค่าจาก server */
  const [draftAvailability, setDraftAvailability] = useState<Map<Id, boolean>>(new Map())
  const toggleTimers = useRef(new Map<Id, ReturnType<typeof setTimeout>>())
  /** null = ปิดฟอร์ม, 'new' = เพิ่มใหม่, object = แก้ไขเมนูนั้น */
  const [editing, setEditing] = useState<MenuItem | 'new' | null>(null)
  /** เมนูที่กำลังถามยืนยันว่าจะลบ — null = ไม่มีกล่องเปิดอยู่ */
  const [deleting, setDeleting] = useState<MenuItem | null>(null)

  const categoryName = useMemo(
    () => new Map((categories ?? []).map((c) => [c.id, c.name])),
    [categories],
  )
  const itemName = useMemo(
    () => new Map((items ?? []).map((i) => [i.id, i.name])),
    [items],
  )

  const visible = useMemo(() => {
    const keyword = search.trim().toLowerCase()
    return (items ?? []).filter(
      (i) =>
        (!categoryId || i.categoryId === categoryId) &&
        (!onlySoldOut || isSoldOut(i)) &&
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

  const soldOutCount = (items ?? []).filter(isSoldOut).length
  const itemsFailed = itemsQuery.isError && !items

  /**
   * เปิด/ปิดขายทีละหลายเมนู ยิงทีละตัวตามลำดับ (backend ไม่มี endpoint แบบกลุ่ม)
   * สำเร็จแล้วขึ้นข้อความพร้อม "เลิกทำ" ที่ย้อนเฉพาะตัวที่เปลี่ยนสำเร็จจริง
   */
  const applyAvailability = async (ids: Id[], next: boolean) => {
    setBusyIds((prev) => new Set([...prev, ...ids]))
    const done: Id[] = []
    try {
      for (const id of ids) {
        await setAvailability.mutateAsync({ id, isAvailable: next })
        done.push(id)
      }
    } catch {
      // error ขึ้นที่ ErrorNote ด้านบนอยู่แล้ว (setAvailability.error)
    } finally {
      setBusyIds((prev) => {
        const rest = new Set(prev)
        for (const id of ids) rest.delete(id)
        return rest
      })
    }
    if (done.length === 0) return

    const what =
      done.length === 1 ? (itemName.get(done[0]) ?? 'เมนู') : `${done.length} เมนู`
    toast(`${next ? 'เปิดขาย' : 'ปิดขาย'} ${what} แล้ว`, {
      label: 'เลิกทำ',
      run: () => applyAvailability(done, !next),
    })
  }

  // ออกจากหน้าระหว่างรอ = ทิ้งที่ยังไม่บันทึก ไม่ยิง API หลังหน้าถูกปิดไปแล้ว
  useEffect(() => {
    const timers = toggleTimers.current
    return () => {
      for (const timer of timers.values()) clearTimeout(timer)
    }
  }, [])

  const clearDraft = (id: Id) =>
    setDraftAvailability((prev) => {
      const rest = new Map(prev)
      rest.delete(id)
      return rest
    })

  /** สวิตช์ของการ์ดเมนู — เปลี่ยนให้เห็นทันที แล้วบันทึกเฉพาะสถานะสุดท้ายเมื่อหยุดกด */
  const queueToggle = (item: MenuItem, next: boolean) => {
    setDraftAvailability((prev) => new Map(prev).set(item.id, next))
    clearTimeout(toggleTimers.current.get(item.id))
    toggleTimers.current.set(
      item.id,
      setTimeout(() => {
        toggleTimers.current.delete(item.id)
        // กดกลับมาที่เดิม = ไม่มีอะไรเปลี่ยน ไม่ต้องยิง
        if (next === item.isAvailable) {
          clearDraft(item.id)
          return
        }
        void applyAvailability([item.id], next).finally(() => clearDraft(item.id))
      }, TOGGLE_DELAY_MS),
    )
  }

  const toggleSelected = (id: Id) =>
    setSelected((prev) => {
      const nextSet = new Set(prev ?? [])
      if (nextSet.has(id)) nextSet.delete(id)
      else nextSet.add(id)
      return nextSet
    })

  const bulkApply = async (next: boolean) => {
    if (!selected?.size) return
    await applyAvailability([...selected], next)
    setSelected(null)
  }

  return (
    <div className={`mx-auto max-w-7xl ${selected ? 'pb-24' : ''}`}>
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
          <Segment
            active={tab === 'menu'}
            onClick={() => setTab('menu')}
          >
            เมนู
          </Segment>
          <Segment
            active={tab === 'ingredient'}
            onClick={() => {
              setSelected(null)
              setTab('ingredient')
            }}
          >
            วัตถุดิบ
          </Segment>
        </div>

        {tab === 'menu' && (
          <label className="relative block w-full sm:w-72">
            <span className="sr-only">ค้นหาเมนู (กด / เพื่อค้นหา)</span>
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
              ref={searchRef}
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="ค้นหาเมนู"
              className={`${field} mt-0 pr-10 pl-10`}
            />
            <kbd
              aria-hidden
              className="pointer-events-none absolute top-1/2 right-3 hidden -translate-y-1/2 rounded border border-gray-300 px-1.5 text-sm text-gray-600 sm:block"
            >
              /
            </kbd>
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

            <button
              type="button"
              aria-pressed={selected !== null}
              onClick={() => setSelected((prev) => (prev ? null : new Set()))}
              className={`${button(selected ? 'primary' : 'secondary', 'md')} sm:ml-auto`}
            >
              {selected ? 'เลิกเลือก' : 'เลือกหลายเมนู'}
            </button>
          </div>

          <p className="mt-3 text-sm text-gray-600">
            <b className="font-semibold text-gray-700">ปิดขาย</b> = ซ่อนจากหน้าลูกค้าชั่วคราว
            เปิดกลับได้ทุกเมื่อ · วัตถุดิบหมดหลายจาน ใช้{' '}
            <b className="font-semibold text-gray-700">เลือกหลายเมนู</b> หรือปิดที่แท็บวัตถุดิบทีเดียว
          </p>

          <div className="mt-5">
            {itemsQuery.isError && (
              <LoadError
                what="รายการเมนู"
                stale={Boolean(items)}
                error={itemsQuery.error}
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
                const draft = draftAvailability.get(item.id)
                return (
                  <li key={item.id} className="flex">
                    <MenuCard
                      item={draft === undefined ? item : { ...item, isAvailable: draft }}
                      category={categoryName.get(item.categoryId)}
                      busy={busyIds.has(item.id)}
                      selecting={selected !== null}
                      selected={selected?.has(item.id) ?? false}
                      onSelect={() => toggleSelected(item.id)}
                      onToggle={(next) => queueToggle(item, next)}
                      onEdit={() => setEditing(item)}
                    />
                  </li>
                )
              })}
            </ul>
          </div>

          {selected && (
            <div
              role="region"
              aria-label="จัดการเมนูที่เลือก"
              className="fixed inset-x-4 bottom-24 z-30 mx-auto flex max-w-3xl flex-wrap items-center gap-2 rounded-xl bg-black p-3 text-white shadow-lg"
            >
              <p className="mr-auto px-1 text-base font-bold">
                เลือกแล้ว {selected.size} เมนู
              </p>
              <button
                type="button"
                onClick={() => setSelected(new Set(visible.map((i) => i.id)))}
                className="min-h-11 rounded-lg px-3 text-sm font-bold text-white transition hover:bg-white/10"
              >
                เลือกทั้งหมดที่เห็น ({visible.length})
              </button>
              <button
                type="button"
                disabled={selected.size === 0 || busyIds.size > 0}
                onClick={() => bulkApply(true)}
                className="min-h-11 rounded-lg border-2 border-white px-4 text-sm font-bold text-white transition hover:bg-white/10 disabled:opacity-50"
              >
                เปิดขาย
              </button>
              <button
                type="button"
                disabled={selected.size === 0 || busyIds.size > 0}
                onClick={() => bulkApply(false)}
                className="min-h-11 rounded-lg bg-white px-4 text-sm font-bold text-black transition hover:bg-gray-100 disabled:opacity-50"
              >
                {busyIds.size > 0 ? 'กำลังบันทึก...' : 'ปิดขาย'}
              </button>
            </div>
          )}
        </>
      )}

      {editing === 'new' && (
        <MenuFormDialog
          defaultCategoryId={categoryId || undefined}
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
                toast(`เพิ่มเมนู ${created.name} แล้ว`)
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
              {
                onSuccess: () => {
                  setEditing(null)
                  toast(`บันทึก ${input.name} แล้ว`)
                },
              },
            )
          }
        />
      )}

      {deleting && (
        <ConfirmDialog
          title="ลบเมนู"
          subject={deleting.name}
          detail={formatBaht(deleting.price)}
          consequence="ลบแล้วกู้คืนไม่ได้ ถ้าเมนูนี้เคยถูกสั่งไปแล้วจะลบไม่ได้ ให้ปิดขายแทนเพื่อซ่อนจากลูกค้า"
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
              onSuccess: () => {
                toast(`ลบ ${deleting.name} แล้ว`)
                setDeleting(null)
              },
            })
          }
        />
      )}
    </div>
  )
}

/**
 * การ์ดเมนู — งานหลักคือเปิด/ปิดขาย สวิตช์จึงใหญ่และอยู่ตรงกลาง ปุ่มแก้ไขเป็นปุ่มรองด้านล่าง
 * โหมดเลือกหลายเมนู: ทั้งการ์ดกลายเป็นปุ่มเลือก ซ่อนสวิตช์/แก้ไขกันกดผิด
 */
function MenuCard({
  item,
  category,
  busy,
  selecting,
  selected,
  onSelect,
  onToggle,
  onEdit,
}: {
  item: MenuItem
  category: string | undefined
  busy: boolean
  selecting: boolean
  selected: boolean
  onSelect: () => void
  onToggle: (next: boolean) => void
  onEdit: () => void
}) {
  const soldOut = isSoldOut(item)
  // ปิดขายเอง กับ วัตถุดิบหลักหมด ต่างกันตรงที่ต้องไปแก้คนละที่ — บอกให้ชัดว่าเพราะอะไร
  const soldOutLabel = !item.isAvailable
    ? 'ปิดขาย'
    : `${item.ingredientsOutOfStock.join(', ')} หมด`

  const body = (
    <>
      <div className="relative aspect-[4/3] w-full overflow-hidden bg-brand-50">
        <FoodImage
          src={item.imageUrl}
          alt={selecting ? '' : item.name}
          className={soldOut ? 'opacity-50 grayscale' : ''}
        />
        {soldOut && (
          <span className="absolute top-2 left-2 rounded-full bg-black/85 px-3 py-1 text-sm font-bold text-white">
            {soldOutLabel}
          </span>
        )}
        {selecting && (
          <span
            aria-hidden
            className={`absolute top-2 right-2 flex h-8 w-8 items-center justify-center rounded-full border-2 ${
              selected ? 'border-brand-500 bg-brand-500 text-white' : 'border-white bg-white/90'
            }`}
          >
            {selected && (
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" className="h-4 w-4">
                <path d="m5 12 5 5 9-10" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            )}
          </span>
        )}
      </div>

      <div className="flex flex-1 flex-col p-3 text-left">
        <div className="flex items-start justify-between gap-2">
          <h2 className="line-clamp-2 text-base font-bold text-black">{item.name}</h2>
          <p className="shrink-0 text-base font-bold text-black tabular-nums">
            {formatBaht(item.price)}
          </p>
        </div>
        {category && <p className="text-sm text-gray-600">{category}</p>}

        {!selecting && (
          <div className="mt-auto pt-3">
            <div className="flex items-center justify-between gap-2 border-t border-gray-200 pt-2">
              <span
                className={`text-sm font-bold ${soldOut ? 'text-danger-ink' : 'text-black'}`}
              >
                {busy ? 'กำลังบันทึก...' : soldOut ? soldOutLabel : 'เปิดขาย'}
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
        )}
      </div>
    </>
  )

  const frame = `flex w-full flex-col overflow-hidden rounded-xl border-2 ${
    selected
      ? 'border-brand-500 bg-brand-50'
      : soldOut
        ? 'border-gray-300 bg-gray-50'
        : 'border-gray-200 bg-white'
  }`

  if (selecting) {
    return (
      <button
        type="button"
        aria-pressed={selected}
        aria-label={`เลือก ${item.name}${soldOut ? ' (ปิดขายอยู่)' : ''}`}
        onClick={onSelect}
        className={`${frame} transition hover:border-brand-400`}
      >
        {body}
      </button>
    )
  }

  return <article className={frame}>{body}</article>
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

/** สั่งไม่ได้ตอนนี้ — ปิดขายเอง หรือวัตถุดิบหลักหมด */
function isSoldOut(item: MenuItem) {
  return !item.isAvailable || item.ingredientsOutOfStock.length > 0
}
