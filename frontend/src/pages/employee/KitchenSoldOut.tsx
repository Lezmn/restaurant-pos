import { ErrorNote } from '@/components/ui/ErrorNote'
import { Modal } from '@/components/ui/Modal'
import { field } from '@/components/ui/styles'
import { useIngredients, useUpdateIngredient } from '@/features/ingredients/hooks'
import { useMenuItems, useSetMenuItemAvailability } from '@/features/menu/hooks'
import type { Id } from '@/types/models'
import { useState } from 'react'

type Tab = 'menu' | 'ingredient'

/**
 * ปุ่ม "ปิดเมนูที่หมด" บนจอครัว — ปิด/เปิดขายเมนูหรือวัตถุดิบได้ทันทีโดยไม่ต้องสลับไปหน้า Manage
 * ใช้ endpoint เดียวกับหน้า Manage (ครัวมีสิทธิ์ทั้งสองอย่าง)
 * ปิดวัตถุดิบ = ทุกเมนู/ตัวเลือกที่ใช้วัตถุดิบนั้นหมดตามทันที (ลูกค้า QR เห็นด้วย)
 */
export function KitchenSoldOutButton() {
  const [open, setOpen] = useState(false)

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex min-h-12 items-center gap-2.5 rounded-xl border-2 border-danger-ink bg-white px-5 text-base font-bold text-danger-ink transition hover:bg-danger/5"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden className="h-5 w-5">
          <circle cx="12" cy="12" r="9" />
          <path d="m6 6 12 12" />
        </svg>
        ปิดเมนูที่หมด
      </button>
      {open && <SoldOutDialog onClose={() => setOpen(false)} />}
    </>
  )
}

function SoldOutDialog({ onClose }: Readonly<{ onClose: () => void }>) {
  const [tab, setTab] = useState<Tab>('menu')
  const [search, setSearch] = useState('')
  const { data: items, isPending: itemsPending } = useMenuItems()
  const { data: ingredients, isPending: ingredientsPending } = useIngredients()
  const setMenu = useSetMenuItemAvailability()
  const setIngredient = useUpdateIngredient()
  /** แถวที่กำลังบันทึก — ล็อกเฉพาะแถวนั้น แถวอื่นกดต่อได้ */
  const [busyId, setBusyId] = useState<Id | null>(null)

  const keyword = search.trim().toLowerCase()
  const match = (name: string) => !keyword || name.toLowerCase().includes(keyword)
  // ของที่หมดอยู่ขึ้นก่อน — ครัวเปิดกลับได้ไว
  const byOffFirst = <T extends { isAvailable: boolean; name: string }>(list: T[]) =>
    [...list].sort(
      (a, b) => Number(a.isAvailable) - Number(b.isAvailable) || a.name.localeCompare(b.name, 'th'),
    )

  const rows =
    tab === 'menu'
      ? byOffFirst((items ?? []).filter((i) => match(i.name))).map((i) => ({
          id: i.id,
          name: i.name,
          isAvailable: i.isAvailable,
          // วัตถุดิบหลักหมด = เมนูสั่งไม่ได้อยู่แล้ว แม้ตัวเมนูจะเปิดขาย
          note:
            i.ingredientsOutOfStock.length > 0
              ? `วัตถุดิบหมด: ${i.ingredientsOutOfStock.join(', ')}`
              : null,
        }))
      : byOffFirst((ingredients ?? []).filter((i) => match(i.name))).map((i) => ({
          id: i.id,
          name: i.name,
          isAvailable: i.isAvailable,
          note:
            i.stockQty === null
              ? `ใช้ใน ${i.menuItemCount + i.menuOptionCount} เมนู/ตัวเลือก`
              : `เหลือ ${i.stockQty}`,
        }))

  const toggle = (id: Id, next: boolean) => {
    setBusyId(id)
    const done = { onSettled: () => setBusyId(null) }
    if (tab === 'menu') setMenu.mutate({ id, isAvailable: next }, done)
    else setIngredient.mutate({ id, isAvailable: next }, done)
  }

  const pending = tab === 'menu' ? itemsPending : ingredientsPending

  return (
    <Modal title="ของหมด" onClose={onClose}>
      <div role="tablist" aria-label="เลือกประเภท" className="grid grid-cols-2 gap-2">
        {(
          [
            ['menu', 'เมนู'],
            ['ingredient', 'วัตถุดิบ'],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            role="tab"
            aria-selected={tab === value}
            onClick={() => setTab(value)}
            className={`min-h-11 rounded-lg text-sm font-bold transition ${
              tab === value ? 'bg-brand-50 text-brand-500 ring-2 ring-brand-400' : 'bg-gray-100 text-gray-700'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <p className="mt-3 text-sm text-gray-600">
        {tab === 'menu'
          ? 'ปิดเมนูที่ทำไม่ได้ตอนนี้ ลูกค้าที่สแกน QR จะเห็นว่าหมดทันที'
          : 'ปิดวัตถุดิบ = ทุกเมนูและตัวเลือกที่ใช้วัตถุดิบนี้หมดตามทันที'}
      </p>

      <input
        type="search"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder={tab === 'menu' ? 'ค้นหาเมนู' : 'ค้นหาวัตถุดิบ'}
        className={field}
      />

      <ErrorNote error={tab === 'menu' ? setMenu.error : setIngredient.error} />

      {pending && <p className="py-6 text-center text-sm text-gray-500">กำลังโหลด...</p>}

      <ul className="mt-3 max-h-[55vh] divide-y divide-gray-100 overflow-y-auto pr-1">
        {rows.map((row) => (
          <li key={row.id} className="flex items-center justify-between gap-3 py-2">
            <div className="min-w-0">
              <p className={`text-base font-semibold ${row.isAvailable ? 'text-black' : 'text-gray-500'}`}>
                {row.name}
              </p>
              {row.note && <p className="text-sm text-gray-600">{row.note}</p>}
            </div>
            <button
              type="button"
              aria-pressed={!row.isAvailable}
              aria-label={`${row.name}: ${row.isAvailable ? 'ขายอยู่ แตะเพื่อปิดเป็นหมด' : 'หมดอยู่ แตะเพื่อเปิดขาย'}`}
              disabled={busyId === row.id}
              onClick={() => toggle(row.id, !row.isAvailable)}
              className={`min-h-11 w-24 shrink-0 rounded-lg text-sm font-bold transition disabled:opacity-50 ${
                row.isAvailable
                  ? 'border-2 border-success bg-success/10 text-black'
                  : 'bg-danger-ink text-white'
              }`}
            >
              {busyId === row.id ? '...' : availabilityLabel(row.isAvailable)}
            </button>
          </li>
        ))}
      </ul>

      {!pending && rows.length === 0 && (
        <p className="py-6 text-center text-sm text-gray-500">ไม่พบ{keyword ? ` “${search.trim()}”` : 'รายการ'}</p>
      )}
    </Modal>
  )
}

function availabilityLabel(isAvailable: boolean) {
  return isAvailable ? 'ขายอยู่' : 'หมด'
}
