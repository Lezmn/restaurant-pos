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
 * ตั้งยอดคงเหลือไว้ = ออเดอร์ตัดยอดให้เอง เหลือ 0 ปิดให้เอง เติมของแล้วเปิดคืนเอง
 *
 * canEdit = เพิ่ม/ลบวัตถุดิบได้ (ADMIN) — ครัวสลับมีของ/หมดและตั้งยอดคงเหลือได้อย่างเดียว
 */
export function IngredientsPanel({ canEdit }: { canEdit: boolean }) {
  const { data: ingredients, isPending } = useIngredients()
  const create = useCreateIngredient()
  const update = useUpdateIngredient()
  const remove = useDeleteIngredient()

  const [name, setName] = useState('')
  const [invalid, setInvalid] = useState('')
  const [deleting, setDeleting] = useState<Ingredient | null>(null)
  /** การ์ดที่กำลังตั้งยอดคงเหลือ */
  const [stockEditing, setStockEditing] = useState<string | null>(null)

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

      {canEdit && (
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
      )}

      {invalid && (
        <p role="alert" className="mt-2 text-sm font-semibold text-danger-ink">
          {invalid}
        </p>
      )}

      <p className="mt-3 max-w-2xl text-sm text-gray-600">
        ปิดวัตถุดิบที่หมด → ตัวเลือกเมนูที่ผูกไว้จะหายจากหน้าลูกค้าทุกเมนูทันที
        {canEdit && ' (ผูกวัตถุดิบเข้ากับตัวเลือกได้ที่ปุ่ม “แก้ไข” ของแต่ละเมนู)'} ·
        กด “ตั้งยอด” เพื่อให้ระบบตัดของตามออเดอร์และปิดเองเมื่อหมด
      </p>

      {isPending && <p className="mt-6 text-sm text-gray-600">กำลังโหลด...</p>}

      {!isPending && (ingredients?.length ?? 0) === 0 && (
        <div className="mt-6 rounded-xl border-2 border-gray-200 p-10 text-center text-base text-gray-600">
          {canEdit ? 'ยังไม่มีวัตถุดิบ — เพิ่มอันแรกด้านบนได้เลย' : 'ยังไม่มีวัตถุดิบ'}
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

              {/* นับสต็อกอยู่และยอดเป็น 0 — เปิดไปก็สั่งไม่ได้จริง เปิดฟอร์มตั้งยอดให้แทน */}
              <Switch
                checked={item.isAvailable}
                label={`มีของ ${item.name}`}
                busy={update.isPending && update.variables?.id === item.id}
                onChange={(next) =>
                  next && item.stockQty === 0
                    ? setStockEditing(item.id)
                    : setStock(item, next)
                }
              />
            </div>

            <div className="mt-3 flex items-center justify-between gap-2 border-t border-gray-200 pt-3">
              <StockStatus item={item} />

              <div className="flex shrink-0 gap-2">
                <button
                  type="button"
                  onClick={() => setStockEditing(stockEditing === item.id ? null : item.id)}
                  aria-expanded={stockEditing === item.id}
                  className={button('outline', 'sm')}
                >
                  ตั้งยอด
                </button>
                {canEdit && (
                  <button
                    type="button"
                    disabled={remove.isPending}
                    onClick={() => setDeleting(item)}
                    className={button('danger-outline', 'sm')}
                  >
                    ลบ
                  </button>
                )}
              </div>
            </div>

            {stockEditing === item.id && (
              <StockForm
                item={item}
                busy={update.isPending}
                onCancel={() => setStockEditing(null)}
                onSave={(stockQty, lowStockAt) =>
                  update
                    .mutateAsync({ id: item.id, stockQty, lowStockAt })
                    .then(() => {
                      setStockEditing(null)
                      toast(
                        stockQty === null
                          ? `${item.name}: เลิกนับสต็อกแล้ว`
                          : `${item.name}: ตั้งยอดคงเหลือ ${stockQty}`,
                      )
                    })
                    .catch(() => {
                      // error ขึ้นที่ ErrorNote ด้านบนอยู่แล้ว
                    })
                }
              />
            )}
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

/** "เหลือ 12" + ป้ายใกล้หมด/หมด — ไม่นับสต็อกก็บอกแค่ มีของ/ของหมด แบบเดิม */
function StockStatus({ item }: Readonly<{ item: Ingredient }>) {
  if (item.stockQty === null) {
    return (
      <span
        className={`text-sm font-semibold ${item.isAvailable ? 'text-black' : 'text-danger-ink'}`}
      >
        {item.isAvailable ? 'มีของ' : 'ของหมด'}
        <span className="ml-1 font-normal text-gray-500">· ไม่นับสต็อก</span>
      </span>
    )
  }

  const low =
    item.stockQty > 0 && item.lowStockAt !== null && item.stockQty <= item.lowStockAt
  return (
    <span className="flex min-w-0 items-center gap-2 text-sm">
      <span className="font-semibold text-black tabular-nums">เหลือ {item.stockQty}</span>
      {item.stockQty === 0 && (
        <span className="rounded-full bg-danger/10 px-2 py-0.5 font-semibold text-danger-ink">
          หมด
        </span>
      )}
      {low && (
        <span className="rounded-full bg-amber-100 px-2 py-0.5 font-semibold text-amber-800">
          ใกล้หมด
        </span>
      )}
      {item.stockQty > 0 && !item.isAvailable && (
        <span className="font-semibold text-danger-ink">ปิดอยู่</span>
      )}
    </span>
  )
}

/** ฟอร์มตั้งยอดคงเหลือ + จุดเตือนใกล้หมด หรือเลิกนับสต็อก */
function StockForm({
  item,
  busy,
  onCancel,
  onSave,
}: Readonly<{
  item: Ingredient
  busy: boolean
  onCancel: () => void
  onSave: (stockQty: number | null, lowStockAt: number | null) => void
}>) {
  const [stock, setStockValue] = useState(item.stockQty === null ? '' : String(item.stockQty))
  const [warn, setWarn] = useState(item.lowStockAt === null ? '' : String(item.lowStockAt))

  const stockNum = Number(stock)
  const warnNum = Number(warn)
  const stockValid = stock.trim() !== '' && Number.isInteger(stockNum) && stockNum >= 0
  const warnValid = warn.trim() === '' || (Number.isInteger(warnNum) && warnNum >= 0)

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        if (stockValid && warnValid) onSave(stockNum, warn.trim() === '' ? null : warnNum)
      }}
      className="mt-3 space-y-2 rounded-lg bg-gray-50 p-3"
    >
      <div className="grid grid-cols-2 gap-2">
        <label className="text-sm">
          <span className="font-semibold text-gray-700">คงเหลือ</span>
          <input
            type="number"
            inputMode="numeric"
            min="0"
            step="1"
            value={stock}
            onChange={(e) => setStockValue(e.target.value)}
            placeholder="เช่น 30"
            aria-invalid={stock.trim() !== '' && !stockValid}
            className={`${field} mt-1 tabular-nums`}
          />
        </label>
        <label className="text-sm">
          <span className="font-semibold text-gray-700">เตือนเมื่อเหลือ</span>
          <input
            type="number"
            inputMode="numeric"
            min="0"
            step="1"
            value={warn}
            onChange={(e) => setWarn(e.target.value)}
            placeholder="ไม่เตือน"
            aria-invalid={!warnValid}
            className={`${field} mt-1 tabular-nums`}
          />
        </label>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="submit"
          disabled={busy || !stockValid || !warnValid}
          className={button('primary', 'sm')}
        >
          บันทึก
        </button>
        <button type="button" onClick={onCancel} className={button('secondary', 'sm')}>
          ยกเลิก
        </button>
        {item.stockQty !== null && (
          <button
            type="button"
            disabled={busy}
            onClick={() => onSave(null, null)}
            className="ml-auto text-sm font-semibold text-gray-600 underline-offset-2 hover:underline"
          >
            เลิกนับสต็อก
          </button>
        )}
      </div>
    </form>
  )
}
