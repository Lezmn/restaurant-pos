import { ErrorNote } from '@/components/ui/ErrorNote'
import { Modal } from '@/components/ui/Modal'
import {
  useCreateIngredient,
  useDeleteIngredient,
  useIngredients,
  useUpdateIngredient,
} from '@/features/ingredients/hooks'
import type { Ingredient } from '@/types/models'
import { useState } from 'react'

/**
 * แท็บวัตถุดิบในหน้า Manage
 *
 * วัตถุดิบเป็นของกลางของร้าน (หมู ไก่ ไข่ ...) ผูกกับ "ตัวเลือกเมนู" ได้หลายอัน
 * ปิดที่นี่ทีเดียว ตัวเลือกที่ผูกไว้จะสั่งไม่ได้ทุกเมนูทันที — ไม่ต้องไล่ปิดทีละเมนู
 */
export function IngredientsPanel() {
  const { data: ingredients, isPending } = useIngredients()
  const create = useCreateIngredient()
  const update = useUpdateIngredient()
  const remove = useDeleteIngredient()

  const [name, setName] = useState('')
  const [invalid, setInvalid] = useState('')
  const [deleting, setDeleting] = useState<Ingredient | null>(null)

  const submit = () => {
    if (!name.trim()) {
      setInvalid('กรุณากรอกชื่อวัตถุดิบ')
      return
    }
    setInvalid('')
    create.mutate(name.trim(), { onSuccess: () => setName('') })
  }

  return (
    <div className="mt-6">
      <ErrorNote error={create.error ?? update.error ?? remove.error} />

      <form
        onSubmit={(e) => {
          e.preventDefault()
          submit()
        }}
        className="flex max-w-xl flex-wrap gap-2"
      >
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="ชื่อวัตถุดิบ เช่น หมู, ไก่, ไข่ดาว"
          className="min-w-0 flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-brand-300"
        />
        <button
          type="submit"
          disabled={create.isPending}
          className="shrink-0 rounded-lg bg-brand-300 px-5 py-2 text-sm font-bold text-white transition hover:bg-brand-400 disabled:opacity-60"
        >
          {create.isPending ? 'กำลังเพิ่ม...' : '+ เพิ่มวัตถุดิบ'}
        </button>
      </form>

      {invalid && (
        <p role="alert" className="mt-2 text-sm font-semibold text-danger">
          {invalid}
        </p>
      )}

      <p className="mt-3 text-sm text-gray-500">
        ปิดวัตถุดิบที่หมด → ตัวเลือกเมนูที่ผูกไว้จะหายจากหน้าลูกค้าทุกเมนูทันที
        (ผูกวัตถุดิบเข้ากับตัวเลือกได้ที่ปุ่ม “แก้ไข” ของแต่ละเมนู)
      </p>

      {isPending && <p className="mt-6 text-sm text-gray-500">กำลังโหลด...</p>}

      {!isPending && (ingredients?.length ?? 0) === 0 && (
        <div className="mt-6 rounded-xl border border-dashed border-gray-300 p-10 text-center text-sm text-gray-500">
          ยังไม่มีวัตถุดิบ — เพิ่มอันแรกด้านบนได้เลย
        </div>
      )}

      <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {ingredients?.map((item) => (
          <article
            key={item.id}
            className={`rounded-xl border-2 bg-white p-4 transition ${
              item.isAvailable ? 'border-gray-200' : 'border-danger/40 bg-danger/5'
            }`}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate font-bold text-black">{item.name}</p>
                <p className="text-xs text-gray-500">
                  {item.menuOptionCount > 0
                    ? `ใช้ใน ${item.menuOptionCount} ตัวเลือกเมนู`
                    : 'ยังไม่ได้ผูกกับเมนูไหน'}
                </p>
              </div>

              <Switch
                checked={item.isAvailable}
                label={`สถานะของ ${item.name}`}
                disabled={update.isPending}
                onChange={(next) =>
                  update.mutate({ id: item.id, isAvailable: next })
                }
              />
            </div>

            <div className="mt-3 flex items-center justify-between border-t border-gray-200 pt-3">
              <span
                className={`text-sm font-semibold ${
                  item.isAvailable ? 'text-success' : 'text-danger'
                }`}
              >
                {item.isAvailable ? 'มีของ' : 'ของหมด'}
              </span>

              <button
                type="button"
                disabled={remove.isPending}
                onClick={() => setDeleting(item)}
                className="text-sm font-semibold text-danger underline-offset-4 transition hover:underline disabled:cursor-not-allowed disabled:opacity-40"
              >
                ลบ
              </button>
            </div>
          </article>
        ))}
      </div>

      {deleting && (
        <Modal
          title="ลบวัตถุดิบ"
          onClose={() => {
            remove.reset()
            setDeleting(null)
          }}
        >
          <ErrorNote error={remove.error} />
          <p className="text-sm text-gray-700">
            ลบวัตถุดิบ{' '}
            <b className="text-black">{deleting.name}</b> ?
            ลบแล้วกู้คืนไม่ได้
          </p>
          {deleting.menuOptionCount > 0 && (
            <p className="mt-2 text-sm text-danger">
              วัตถุดิบนี้ผูกกับ {deleting.menuOptionCount} ตัวเลือกเมนู —
              ตัวเลือกที่ยังไม่เคยถูกสั่งจะถูกลบ ส่วนที่เคยถูกสั่งแล้วจะถูกปิดขาย
              (ประวัติออเดอร์ยังอยู่ครบ)
            </p>
          )}

          <div className="mt-5 grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => setDeleting(null)}
              className="rounded-lg border-2 border-gray-300 py-2.5 text-sm font-bold text-gray-700 transition hover:bg-gray-50"
            >
              ยกเลิก
            </button>
            <button
              type="button"
              disabled={remove.isPending}
              onClick={() =>
                remove.mutate(deleting.id, {
                  onSuccess: () => setDeleting(null),
                })
              }
              className="rounded-lg bg-danger py-2.5 text-sm font-bold text-white transition hover:brightness-95 disabled:opacity-60"
            >
              {remove.isPending ? 'กำลังลบ...' : 'ลบวัตถุดิบ'}
            </button>
          </div>
        </Modal>
      )}
    </div>
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
