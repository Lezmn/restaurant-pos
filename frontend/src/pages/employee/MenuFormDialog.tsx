import { button, field, fieldLabel } from '@/components/ui/styles'
import { ErrorNote } from '@/components/ui/ErrorNote'
import { Modal } from '@/components/ui/Modal'
import { useCategories } from '@/features/menu/hooks'
import type { MenuItemInput, MenuOptionInput } from '@/features/menu/api'
import { useIngredients } from '@/features/ingredients/hooks'
import type { Id, MenuItem } from '@/types/models'
import { useState } from 'react'
import { MenuOptionsEditor, PendingOptionsEditor } from './MenuOptionsEditor'

/** ฟอร์มเพิ่ม/แก้ไขเมนู — ใช้ตัวเดียวกันทั้งสองกรณี ต่างแค่ค่าเริ่มต้น */
export function MenuFormDialog({
  item,
  isSaving,
  error,
  onCancel,
  onDelete,
  onSubmit,
}: {
  /** ไม่ส่งมา = โหมดเพิ่มเมนูใหม่ */
  item?: MenuItem
  isSaving: boolean
  error: unknown
  onCancel: () => void
  /** โหมดแก้ไขเท่านั้น — ลบเมนูนี้ (เปิดกล่องยืนยันต่อ) */
  onDelete?: () => void
  /** โหมดเพิ่มเมนูใหม่จะได้ options ที่ผู้ใช้ใส่ไว้มาด้วย (โหมดแก้ไขยิง API ตรงจาก editor เอง) */
  onSubmit: (input: MenuItemInput, pendingOptions: MenuOptionInput[]) => void
}) {
  const { data: categories } = useCategories()

  const [name, setName] = useState(item?.name ?? '')
  const [price, setPrice] = useState(String(item?.price ?? ''))
  const [imageUrl, setImageUrl] = useState(item?.imageUrl ?? '')
  const [categoryId, setCategoryId] = useState(item?.categoryId ?? '')
  const [isAvailable, setIsAvailable] = useState(item?.isAvailable ?? true)
  const [ingredientIds, setIngredientIds] = useState<Id[]>(
    () => item?.ingredients.map((i) => i.id) ?? [],
  )
  const [pendingOptions, setPendingOptions] = useState<MenuOptionInput[]>([])
  /** โชว์ข้อผิดพลาดหลังกดบันทึกครั้งแรกเท่านั้น ไม่ขึ้นแดงตั้งแต่ยังไม่ได้พิมพ์ */
  const [attempted, setAttempted] = useState(false)

  // เดิมส่งชื่อว่าง/ราคาว่างไปให้ backend ตอบ 400 กลับมาเป็นข้อความรวม ๆ — ตรวจที่ฟอร์มก่อน บอกตรงช่อง
  const priceNum = Number(price)
  const errors = {
    name: name.trim() === '' ? 'กรอกชื่อเมนู' : '',
    price:
      price.trim() === ''
        ? 'กรอกราคา (ใส่ 0 ได้ถ้าแจกฟรี)'
        : !Number.isFinite(priceNum) || priceNum < 0
          ? 'ราคาต้องเป็นตัวเลขตั้งแต่ 0 ขึ้นไป'
          : '',
    category:
      !categoryId && !categories?.length ? 'ยังไม่มีหมวดหมู่ในระบบ' : '',
    imageUrl:
      imageUrl.trim() && !/^https?:\/\//.test(imageUrl.trim())
        ? 'ลิงก์รูปต้องขึ้นต้นด้วย http:// หรือ https://'
        : '',
  }
  const firstError = (Object.keys(errors) as (keyof typeof errors)[]).find((k) => errors[k])
  const show = (key: keyof typeof errors) => (attempted ? errors[key] : '')

  return (
    <Modal
      title={item ? `แก้ไข ${item.name}` : 'เพิ่มเมนูใหม่'}
      onClose={onCancel}
    >
      <form
        noValidate
        onSubmit={(e) => {
          e.preventDefault()
          setAttempted(true)
          if (firstError) {
            // พาไปช่องแรกที่ผิด ไม่ต้องไล่หาเอง
            e.currentTarget.querySelector<HTMLElement>(`[name="${firstError}"]`)?.focus()
            return
          }
          onSubmit(
            {
              name: name.trim(),
              price: priceNum,
              imageUrl: imageUrl.trim() || null,
              categoryId: categoryId || (categories?.[0]?.id ?? ''),
              isAvailable,
              ingredientIds,
            },
            pendingOptions,
          )
        }}
        className="space-y-3"
      >
        <ErrorNote error={error} />

        <label className="block text-sm">
          <span className={fieldLabel}>ชื่อเมนู</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            name="name"
            placeholder="เช่น ข้าวผัดกะเพรา"
            aria-invalid={Boolean(show('name'))}
            aria-describedby={show('name') ? 'menu-name-error' : undefined}
            className={`${field} ${show('name') ? 'border-danger' : ''}`}
          />
          <FieldError id="menu-name-error" message={show('name')} />
        </label>

        <div className="grid grid-cols-2 gap-3">
          <label className="block text-sm">
            <span className={fieldLabel}>ราคา (บาท)</span>
            <input
              type="number"
              min="0"
              step="1"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              name="price"
              inputMode="numeric"
              aria-invalid={Boolean(show('price'))}
              aria-describedby={show('price') ? 'menu-price-error' : undefined}
              className={`${field} tabular-nums ${show('price') ? 'border-danger' : ''}`}
            />
            <FieldError id="menu-price-error" message={show('price')} />
          </label>

          <label className="block text-sm">
            <span className={fieldLabel}>หมวดหมู่</span>
            <select
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
              name="category"
              aria-invalid={Boolean(show('category'))}
              className={field}
            >
              <option value="">
                {categories?.[0] ? `ไม่เลือก = ${categories[0].name}` : 'เลือกหมวดหมู่'}
              </option>
              {categories?.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            <FieldError id="menu-category-error" message={show('category')} />
          </label>
        </div>

        <label className="block text-sm">
          <span className={fieldLabel}>ลิงก์รูปภาพ</span>
          <input
            value={imageUrl}
            onChange={(e) => setImageUrl(e.target.value)}
            name="imageUrl"
            inputMode="url"
            placeholder="https://... (ไม่ใส่ก็ได้)"
            aria-invalid={Boolean(show('imageUrl'))}
            aria-describedby={show('imageUrl') ? 'menu-image-error' : undefined}
            className={`${field} ${show('imageUrl') ? 'border-danger' : ''}`}
          />
          <FieldError id="menu-image-error" message={show('imageUrl')} />
        </label>

        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={isAvailable}
            onChange={(e) => setIsAvailable(e.target.checked)}
            className="h-5 w-5"
          />
          <span className={fieldLabel}>พร้อมจำหน่าย</span>
        </label>

        <MainIngredientsPicker value={ingredientIds} onChange={setIngredientIds} />

        {/* โหมดแก้ไขยิง API ทันที; โหมดเพิ่มเมนูใหม่ยังไม่มี id จึงพักไว้ก่อนแล้วสร้างตามหลัง */}
        {item ? (
          <MenuOptionsEditor menuItemId={item.id} />
        ) : (
          <PendingOptionsEditor options={pendingOptions} onChange={setPendingOptions} />
        )}

        <div className="grid grid-cols-2 gap-3 pt-2">
          <button
            type="button"
            onClick={onCancel}
            className={button('secondary', 'lg')}
          >
            ยกเลิก
          </button>
          <button
            type="submit"
            disabled={isSaving}
            className={button('primary', 'lg')}
          >
            {isSaving ? 'กำลังบันทึก...' : 'บันทึก'}
          </button>
        </div>

        {/* แยกโซนอันตรายไว้ล่างสุด ห่างจากปุ่มบันทึก */}
        {item && onDelete && (
          <div className="mt-2 border-t border-gray-200 pt-4">
            <button
              type="button"
              onClick={onDelete}
              className={`${button('danger-outline')} w-full`}
            >
              ลบเมนูนี้
            </button>
            <p className="mt-1 text-center text-sm text-gray-600">
              เมนูที่เคยถูกสั่งแล้วลบไม่ได้ ให้ปิดขายแทน
            </p>
          </div>
        )}
      </form>
    </Modal>
  )
}

/**
 * วัตถุดิบหลักที่เมนูใช้เสมอ (ข้าวไข่เจียว → ไข่) — วัตถุดิบตัวไหนหมด ทั้งเมนูหายจากหน้าสั่ง
 * ต่างจากวัตถุดิบของตัวเลือกที่หมดแค่ตัวเลือกนั้น (กะเพรา + ไข่ดาว)
 */
function MainIngredientsPicker({
  value,
  onChange,
}: Readonly<{ value: Id[]; onChange: (next: Id[]) => void }>) {
  const { data: ingredients } = useIngredients()

  return (
    <fieldset className="text-sm">
      <legend className={fieldLabel}>วัตถุดิบหลัก</legend>
      <p className="text-sm text-gray-600">
        วัตถุดิบที่ต้องใช้ทุกจาน ตัวไหนหมด ทั้งเมนูจะสั่งไม่ได้ (ไม่เลือกก็ได้)
      </p>
      {ingredients?.length ? (
        <div className="mt-2 flex flex-wrap gap-2">
          {ingredients.map((ing) => {
            const on = value.includes(ing.id)
            return (
              <button
                key={ing.id}
                type="button"
                aria-pressed={on}
                onClick={() =>
                  onChange(on ? value.filter((id) => id !== ing.id) : [...value, ing.id])
                }
                className={`min-h-10 rounded-full border-2 px-3 text-sm font-semibold ${
                  on
                    ? 'border-brand-500 bg-brand-50 text-black'
                    : 'border-gray-200 bg-white text-gray-700'
                }`}
              >
                {on && <span aria-hidden>✓ </span>}
                {ing.name}
                {!ing.isAvailable && <span className="text-danger-ink"> · หมด</span>}
              </button>
            )
          })}
        </div>
      ) : (
        <p className="mt-1 text-sm text-gray-600">
          ยังไม่มีวัตถุดิบ — เพิ่มได้ที่แท็บ "วัตถุดิบ"
        </p>
      )}
    </fieldset>
  )
}

function FieldError({ id, message }: { id: string; message: string }) {
  if (!message) return null
  return (
    <span id={id} role="alert" className="mt-1 block text-sm font-semibold text-danger-ink">
      {message}
    </span>
  )
}
