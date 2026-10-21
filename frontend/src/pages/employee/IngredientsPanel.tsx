import { button, field } from '@/components/ui/styles'
import { ErrorNote } from '@/components/ui/ErrorNote'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { Switch } from '@/components/ui/Switch'
import { toast } from '@/components/ui/toast'
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
    const added = name.trim()
    create.mutate(added, {
      onSuccess: () => {
        setName('')
        toast(`เพิ่มวัตถุดิบ ${added} แล้ว`)
      },
    })
  }

  /** เปิด/ปิดวัตถุดิบ แล้วขึ้นข้อความพร้อม "เลิกทำ" — ปิดผิดตัวกระทบทุกเมนูที่ใช้ จึงต้องย้อนได้ง่าย */
  const setStock = (item: Ingredient, next: boolean) =>
    update
      .mutateAsync({ id: item.id, isAvailable: next })
      .then(() =>
        toast(`${item.name}: ${next ? 'มีของแล้ว' : 'ของหมด'}`, {
          label: 'เลิกทำ',
          run: () => setStock(item, !next),
        }),
      )
      .catch(() => {
        // error ขึ้นที่ ErrorNote ด้านบนอยู่แล้ว
      })

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
          placeholder="ชื่อวัตถุดิบ เช่น หมู, ไก่, ไข่"
          aria-label="ชื่อวัตถุดิบ"
          aria-invalid={Boolean(invalid)}
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
                <p className="text-sm text-gray-600">{usageText(item)}</p>
              </div>

              <Switch
                checked={item.isAvailable}
                label={`มีของ ${item.name}`}
                busy={update.isPending && update.variables?.id === item.id}
                onChange={(next) => setStock(item, next)}
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
                className={button('danger-outline', 'sm')}
              >
                ลบ
              </button>
            </div>
          </article>
        ))}
      </div>

      {deleting && (
        <ConfirmDialog
          title="ลบวัตถุดิบ"
          subject={deleting.name}
          detail={usageText(deleting)}
          consequence={
            deleting.menuOptionCount > 0
              ? 'ลบแล้วกู้คืนไม่ได้ ตัวเลือกที่ยังไม่เคยถูกสั่งจะถูกลบ ส่วนที่เคยถูกสั่งแล้วจะถูกปิดขาย (ประวัติออเดอร์ยังอยู่ครบ) ถ้าแค่ของหมด ให้ปิดสวิตช์แทน'
              : deleting.menuItemCount > 0
                ? 'ลบแล้วกู้คืนไม่ได้ เมนูที่ใช้วัตถุดิบนี้จะถูกปลดออก (เมนูยังอยู่) ถ้าแค่ของหมด ให้ปิดสวิตช์แทน'
                : 'ลบแล้วกู้คืนไม่ได้ ถ้าแค่ของหมด ให้ปิดสวิตช์แทน'
          }
          confirmLabel="ลบวัตถุดิบ"
          pendingLabel="กำลังลบ..."
          isPending={remove.isPending}
          error={remove.error}
          onCancel={() => {
            remove.reset()
            setDeleting(null)
          }}
          onConfirm={() =>
            remove.mutate(deleting.id, {
              onSuccess: () => {
                toast(`ลบวัตถุดิบ ${deleting.name} แล้ว`)
                setDeleting(null)
              },
            })
          }
        />
      )}
    </div>
  )
}

/** "ใช้ใน 1 เมนู · 4 ตัวเลือก" — บอกให้รู้ว่าปิดแล้วกระทบอะไรบ้าง */
function usageText(item: Ingredient) {
  const parts = [
    item.menuItemCount > 0 ? `${item.menuItemCount} เมนู` : '',
    item.menuOptionCount > 0 ? `${item.menuOptionCount} ตัวเลือก` : '',
  ].filter(Boolean)
  return parts.length ? `ใช้ใน ${parts.join(' · ')}` : 'ยังไม่ได้ผูกกับเมนูไหน'
}
