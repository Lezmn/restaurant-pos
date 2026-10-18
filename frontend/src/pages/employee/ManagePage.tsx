import { FoodImage } from '@/components/ui/FoodImage'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { ErrorNote } from '@/components/ui/ErrorNote'
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
import { useMemo, useState } from 'react'

type Tab = 'menu' | 'ingredient'

export function ManagePage() {
  const { data: items, isPending } = useMenuItems()
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
  /** null = ปิดฟอร์ม, 'new' = เพิ่มใหม่, object = แก้ไขเมนูนั้น */
  const [editing, setEditing] = useState<MenuItem | 'new' | null>(null)
  /** เมนูที่กำลังถามยืนยันว่าจะลบ — null = ไม่มีกล่องเปิดอยู่ */
  const [deleting, setDeleting] = useState<MenuItem | null>(null)

  const visible = useMemo(() => {
    const keyword = search.trim().toLowerCase()
    return (items ?? []).filter(
      (i) =>
        (!categoryId || i.categoryId === categoryId) &&
        (!keyword || i.name.toLowerCase().includes(keyword)),
    )
  }, [items, search, categoryId])

  /** จำนวนเมนูต่อหมวด ไว้โชว์ท้ายชื่อชิป */
  const countByCategory = useMemo(() => {
    const counts = new Map<string, number>()
    for (const i of items ?? []) {
      counts.set(i.categoryId, (counts.get(i.categoryId) ?? 0) + 1)
    }
    return counts
  }, [items])

  return (
    <div>
      <ErrorNote error={setAvailability.error ?? deleteItem.error} />

      {/* แถบเครื่องมือ: toggle เมนู/วัตถุดิบ + ค้นหา */}
      <div className="flex flex-col gap-3 rounded-xl border border-gray-200 p-3 sm:flex-row sm:items-center sm:gap-4">
        <button
          type="button"
          onClick={() => setEditing('new')}
          className="rounded-full bg-brand-300 px-5 py-2 text-sm font-bold text-white transition hover:bg-brand-400 sm:mr-auto"
        >
          + เพิ่มเมนู
        </button>

        <div className="flex gap-2">
          <TabButton active={tab === 'menu'} onClick={() => setTab('menu')}>
            เมนู
          </TabButton>
          <TabButton
            active={tab === 'ingredient'}
            onClick={() => setTab('ingredient')}
          >
            วัตถุดิบ
          </TabButton>
        </div>

        <label className="relative block flex-1 sm:max-w-md">
          <span className="sr-only">ค้นหา</span>
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            aria-hidden
            className="pointer-events-none absolute top-1/2 left-4 h-5 w-5 -translate-y-1/2 text-black"
          >
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-3.5-3.5" strokeLinecap="round" />
          </svg>
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="ค้นหา"
            className="w-full rounded-2xl bg-gray-300/40 py-3 pr-4 pl-12 font-bold text-black outline-none placeholder:text-black/70 focus:bg-gray-300/60"
          />
        </label>
      </div>

      {/* แถบหมวดหมู่ — กดเพื่อกรองเมนูในตาราง ใช้ร่วมกับช่องค้นหาได้ */}
      {tab === 'menu' && (
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <Chip active={categoryId === ''} onClick={() => setCategoryId('')}>
            {`ทั้งหมด (${items?.length ?? 0})`}
          </Chip>
          {categories?.map((c) => (
            <Chip
              key={c.id}
              active={categoryId === c.id}
              onClick={() => setCategoryId(c.id)}
            >
              {`${c.name} (${countByCategory.get(c.id) ?? 0})`}
            </Chip>
          ))}
        </div>
      )}

      {tab === 'ingredient' ? (
        <IngredientsPanel />
      ) : (
        <>
          {isPending && (
            <p className="mt-6 text-sm text-gray-500">กำลังโหลด...</p>
          )}

          {!isPending && visible.length === 0 && (
            <p className="mt-10 text-center text-sm text-gray-500">
              {categoryId && !search.trim()
                ? 'หมวดนี้ยังไม่มีเมนู — กด "+ เพิ่มเมนู" แล้วเลือกหมวดนี้ได้เลย'
                : 'ไม่พบเมนูที่ค้นหา'}
            </p>
          )}

          <div className="mt-5 grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
            {visible.map((item) => (
              <article
                key={item.id}
                className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm"
              >
                <div className="aspect-[4/3] w-full overflow-hidden">
                  <FoodImage src={item.imageUrl} alt={item.name} />
                </div>

                <div className="p-3">
                  <div className="flex items-baseline justify-between gap-2 border-b border-gray-200 pb-2">
                    <p className="truncate text-sm font-semibold text-black">
                      {item.name}
                    </p>
                    <p className="shrink-0 text-sm font-semibold text-black">
                      {formatBaht(item.price)}
                    </p>
                  </div>

                  <div className="mt-2 flex items-end justify-between gap-2">
                    <div>
                      <p className="text-sm text-gray-700">สถานะ</p>
                      <p
                        className={`text-sm ${
                          item.isAvailable ? 'text-black' : 'text-gray-400'
                        }`}
                      >
                        {item.isAvailable ? 'พร้อมจำหน่าย' : 'หมดชั่วคราว'}
                      </p>
                    </div>

                    <Switch
                      checked={item.isAvailable}
                      label={`สถานะของ ${item.name}`}
                      disabled={setAvailability.isPending}
                      onChange={(next) =>
                        setAvailability.mutate({
                          id: item.id,
                          isAvailable: next,
                        })
                      }
                    />
                  </div>

                  <div className="mt-3 grid grid-cols-2 gap-2 border-t border-gray-200 pt-3">
                    <button
                      type="button"
                      onClick={() => setEditing(item)}
                      className="min-h-10 rounded-lg border-2 border-brand-300 py-2 text-sm font-bold text-brand-400 transition hover:bg-brand-50"
                    >
                      แก้ไข
                    </button>
                    <button
                      type="button"
                      disabled={deleteItem.isPending}
                      onClick={() => setDeleting(item)}
                      className="min-h-10 rounded-lg border-2 border-danger py-2 text-sm font-bold text-danger transition hover:bg-danger/10 disabled:opacity-60"
                    >
                      ลบ
                    </button>
                  </div>
                </div>
              </article>
            ))}
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
          consequence="ถ้าเมนูนี้เคยถูกสั่งไปแล้วจะลบไม่ได้ — ให้ปิดสวิตช์ 'พร้อมจำหน่าย' แทนเพื่อซ่อนจากลูกค้า"
          confirmLabel="ลบเมนู"
          pendingLabel="กำลังลบ..."
          isPending={deleteItem.isPending}
          error={deleteItem.error}
          onCancel={() => setDeleting(null)}
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

/** ชิปหมวดหมู่ — เล็กกว่า TabButton และไม่มีขอบตอนไม่ active แถวยาว ๆ จะได้ไม่รก */
function Chip({
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
      className={`min-h-10 rounded-full px-4 py-2 text-sm font-bold transition ${
        active
          ? 'bg-brand-400 text-white'
          : 'bg-gray-100 text-gray-700 hover:bg-brand-50 hover:text-brand-400'
      }`}
    >
      {children}
    </button>
  )
}

function TabButton({
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
      className={`rounded-full border-2 px-5 py-2 text-sm font-bold transition ${
        active
          ? 'border-brand-400 bg-brand-400 text-white'
          : 'border-brand-400 bg-white text-brand-400 hover:bg-brand-50'
      }`}
    >
      {children}
    </button>
  )
}

function Switch({
  checked,
  label,
  disabled,
  onChange,
}: {
  checked: boolean
  label: string
  disabled: boolean
  onChange: (next: boolean) => void
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      // ปุ่มจริงใหญ่ 40×56 (พื้นที่กดบน iPad) ตัวสวิตช์ที่เห็นอยู่ข้างใน
      className="flex h-10 w-14 shrink-0 items-center justify-center disabled:opacity-60"
    >
      <span
        className={`relative block h-7 w-12 rounded-full transition ${
          checked ? 'bg-brand-400' : 'bg-gray-300'
        }`}
      >
        <span
          className={`absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition-all ${
            checked ? 'left-[22px]' : 'left-0.5'
          }`}
        />
      </span>
    </button>
  )
}
