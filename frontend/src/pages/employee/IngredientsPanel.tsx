import { button, field } from '@/components/ui/styles'
import { ErrorNote } from '@/components/ui/ErrorNote'
import { Modal } from '@/components/ui/Modal'
import { Switch } from '@/components/ui/Switch'
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
          aria-label="ชื่อวัตถุดิบ"
          className={`${field} mt-0 min-w-0 flex-1`}
        />
        <button
          type="submit"
          disabled={create.isPending}
          className={`${button('primary', 'lg')} shrink-0`}
        >
          {create.isPending ? 'กำลังเพิ่ม...' : 'เพิ่มวัตถุดิบ'}
        </button>
      </form>

      {invalid && (
        <p role="alert" className="mt-2 text-sm font-semibold text-danger-ink">
          {invalid}
        </p>
      )}

      <p className="mt-3 max-w-2xl text-sm text-gray-600">
        ปิดวัตถุดิบที่หมด → ตัวเลือกเมนูที่ผูกไว้จะหายจากหน้าลูกค้าทุกเมนูทันที
        (ผูกวัตถุดิบเข้ากับตัวเลือกได้ที่ปุ่ม “แก้ไข” ของแต่ละเมนู)
      </p>

      {isPending && <p className="mt-6 text-sm text-gray-600">กำลังโหลด...</p>}

      {!isPending && (ingredients?.length ?? 0) === 0 && (
        <div className="mt-6 rounded-xl border-2 border-gray-200 p-10 text-center text-base text-gray-600">
          ยังไม่มีวัตถุดิบ — เพิ่มอันแรกด้านบนได้เลย
        </div>
      )}

      <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
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
                <p className="text-sm text-gray-600">
                  {item.menuOptionCount > 0
                    ? `ใช้ใน ${item.menuOptionCount} ตัวเลือกเมนู`
                    : 'ยังไม่ได้ผูกกับเมนูไหน'}
                </p>
              </div>

              <Switch
                checked={item.isAvailable}
                label={`มีของ ${item.name}`}
                busy={update.isPending && update.variables?.id === item.id}
                onChange={(next) =>
                  update.mutate({ id: item.id, isAvailable: next })
                }
              />
            </div>

            <div className="mt-3 flex items-center justify-between border-t border-gray-200 pt-3">
              <span
                className={`text-sm font-semibold ${
                  item.isAvailable ? 'text-black' : 'text-danger-ink'
                }`}
              >
                {item.isAvailable ? 'มีของ' : 'ของหมด'}
              </span>

              <button
                type="button"
                disabled={remove.isPending}
                onClick={() => setDeleting(item)}
                className="min-h-10 rounded-lg px-3 text-sm font-bold text-danger-ink transition hover:bg-danger/5 disabled:cursor-not-allowed disabled:opacity-40"
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
            <p className="mt-2 text-sm text-danger-ink">
              วัตถุดิบนี้ผูกกับ {deleting.menuOptionCount} ตัวเลือกเมนู —
              ตัวเลือกที่ยังไม่เคยถูกสั่งจะถูกลบ ส่วนที่เคยถูกสั่งแล้วจะถูกปิดขาย
              (ประวัติออเดอร์ยังอยู่ครบ)
            </p>
          )}

          <div className="mt-5 grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => setDeleting(null)}
              className={button('secondary', 'lg')}
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
              className={button('danger', 'lg')}
            >
              {remove.isPending ? 'กำลังลบ...' : 'ลบวัตถุดิบ'}
            </button>
          </div>
        </Modal>
      )}
    </div>
  )
}
