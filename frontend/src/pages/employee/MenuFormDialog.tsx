import { button, field, fieldLabel } from '@/components/ui/styles'
import { ErrorNote } from '@/components/ui/ErrorNote'
import { Modal } from '@/components/ui/Modal'
import { useCategories } from '@/features/menu/hooks'
import type { MenuItemInput, MenuOptionInput } from '@/features/menu/api'
import { useIngredients } from '@/features/ingredients/hooks'
import type { Id, MenuItem } from '@/types/models'
import { useState } from 'react'
import { MenuOptionsEditor, PendingOptionsEditor } from './MenuOptionsEditor'

function priceError(price: string) {
  if (price.trim() === '') return 'กรอกราคา (ใส่ 0 ได้ถ้าแจกฟรี)'
  const value = Number(price)
  return Number.isFinite(value) && value >= 0 ? '' : 'ราคาต้องเป็นตัวเลขตั้งแต่ 0 ขึ้นไป'
}

// บังคับเลือก — เดิมไม่เลือกแล้วเมนูไปตกหมวดแรก (ของหวาน) เงียบ ๆ
function categoryError(categoryId: string, hasCategories: boolean) {
  if (categoryId) return ''
  return hasCategories ? 'เลือกหมวดหมู่' : 'ยังไม่มีหมวดหมู่ในระบบ'
}

/**
 * ข้อความผิดของแต่ละช่อง ('' = ผ่าน) — เรียงตามลำดับช่องบนฟอร์ม ใช้หาช่องแรกที่ผิดด้วย
 * เดิมส่งชื่อว่าง/ราคาว่างไปให้ backend ตอบ 400 กลับมาเป็นข้อความรวม ๆ — ตรวจที่ฟอร์มก่อน บอกตรงช่อง
 */
function validateMenuForm(form: Readonly<{
  name: string
  price: string
  imageUrl: string
  categoryId: string
  hasCategories: boolean
  /** โหมดเพิ่มเมนู: แถวตัวเลือกมีข้อความค้างที่ยังไม่ได้กด "+ เพิ่ม" */
  hasUnaddedOption: boolean
}>) {
  const url = form.imageUrl.trim()
  return {
    name: form.name.trim() === '' ? 'กรอกชื่อเมนู' : '',
    price: priceError(form.price),
    category: categoryError(form.categoryId, form.hasCategories),
    options: form.hasUnaddedOption
      ? 'ตัวเลือกที่พิมพ์ไว้ยังไม่ได้เพิ่ม กด "+ เพิ่ม" หรือลบข้อความออกก่อน'
      : '',
    imageUrl: url && !/^https?:\/\//.test(url) ? 'ลิงก์รูปต้องขึ้นต้นด้วย http:// หรือ https://' : '',
  }
}

/** ฟอร์มเพิ่ม/แก้ไขเมนู — ใช้ตัวเดียวกันทั้งสองกรณี ต่างแค่ค่าเริ่มต้น */
export function MenuFormDialog({
  item,
  isSaving,
  error,
  defaultCategoryId,
  onCancel,
  onDelete,
  onSubmit,
}: Readonly<{
  /** ไม่ส่งมา = โหมดเพิ่มเมนูใหม่ */
  item?: MenuItem
  /** โหมดเพิ่มเมนู: หมวดที่กำลังกรองอยู่ในหน้า Manage — ตั้งให้เป็นค่าเริ่มต้น */
  defaultCategoryId?: string
  isSaving: boolean
  error: unknown
  onCancel: () => void
  /** โหมดแก้ไขเท่านั้น — ลบเมนูนี้ (เปิดกล่องยืนยันต่อ) */
  onDelete?: () => void
  /** โหมดเพิ่มเมนูใหม่จะได้ options ที่ผู้ใช้ใส่ไว้มาด้วย (โหมดแก้ไขยิง API ตรงจาก editor เอง) */
  onSubmit: (input: MenuItemInput, pendingOptions: MenuOptionInput[]) => void
}>) {
  const { data: categories } = useCategories()

  const [name, setName] = useState(item?.name ?? '')
  const [price, setPrice] = useState(String(item?.price ?? ''))
  const [imageUrl, setImageUrl] = useState(item?.imageUrl ?? '')
  const [categoryId, setCategoryId] = useState(item?.categoryId ?? defaultCategoryId ?? '')
  const [isAvailable, setIsAvailable] = useState(item?.isAvailable ?? true)
  const [ingredientIds, setIngredientIds] = useState<Id[]>(
    () => item?.ingredients.map((i) => i.id) ?? [],
  )
  const [pendingOptions, setPendingOptions] = useState<MenuOptionInput[]>([])
  /** โชว์ข้อผิดพลาดหลังกดบันทึกครั้งแรกเท่านั้น ไม่ขึ้นแดงตั้งแต่ยังไม่ได้พิมพ์ */
  const [attempted, setAttempted] = useState(false)
  /** แถวเพิ่มตัวเลือกมีข้อความค้างที่ยังไม่ได้กด "+ เพิ่ม" — กันหายเงียบ ๆ ตอนบันทึก/ปิด */
  const [optionDraftDirty, setOptionDraftDirty] = useState(false)
  /** กดปิดทั้งที่ตัวเลือกค้างอยู่ 1 ครั้ง = เตือน กดซ้ำ = ปิดจริง */
  const [closeWarned, setCloseWarned] = useState(false)

  const requestClose = () => {
    if (optionDraftDirty && !closeWarned) {
      setCloseWarned(true)
      return
    }
    onCancel()
  }

  const priceNum = Number(price)
  const errors = validateMenuForm({
    name,
    price,
    imageUrl,
    categoryId,
    hasCategories: Boolean(categories?.length),
    hasUnaddedOption: !item && optionDraftDirty,
  })
  const saveLabel = item ? 'บันทึกข้อมูลเมนู' : 'บันทึก'
  const firstError = (Object.keys(errors) as (keyof typeof errors)[]).find((k) => errors[k])
  const show = (key: keyof typeof errors) => (attempted ? errors[key] : '')

  return (
    <Modal
      title={item ? `แก้ไข ${item.name}` : 'เพิ่มเมนูใหม่'}
      onClose={requestClose}
      size="lg"
    >
      <form
        noValidate
        onSubmit={(e) => {
          e.preventDefault()
          setAttempted(true)
          if (firstError) {
            // พาไปช่องแรกที่ผิด ไม่ต้องไล่หาเอง
            const target =
              firstError === 'options'
                ? '[data-option-draft]'
                : `[name="${firstError}"]`
            e.currentTarget.querySelector<HTMLElement>(target)?.focus()
            return
          }
          onSubmit(
            {
              name: name.trim(),
              price: priceNum,
              imageUrl: imageUrl.trim() || null,
              categoryId,
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
              aria-describedby={show('category') ? 'menu-category-error' : undefined}
              className={`${field} ${show('category') ? 'border-danger' : ''}`}
            >
              <option value="" disabled>
                เลือกหมวดหมู่
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

        {/* โหมดเพิ่มเมนูใหม่ยังไม่มี id จึงพักตัวเลือกไว้ในฟอร์ม แล้วสร้างตามหลังตอนกดบันทึก */}
        {!item && (
          <>
            <PendingOptionsEditor
              options={pendingOptions}
              onChange={setPendingOptions}
              onDraftChange={setOptionDraftDirty}
            />
            <FieldError id="menu-options-error" message={show('options')} />
          </>
        )}

        <div className="grid grid-cols-2 gap-3 pt-2">
          <button
            type="button"
            onClick={requestClose}
            className={button('secondary', 'lg')}
          >
            ยกเลิก
          </button>
          <button
            type="submit"
            disabled={isSaving}
            className={button('primary', 'lg')}
          >
            {isSaving ? 'กำลังบันทึก...' : saveLabel}
          </button>
        </div>
        {item && (
          <p className="text-center text-sm text-gray-600">
            ปุ่มบันทึกนี้ใช้กับข้อมูลด้านบนเท่านั้น ตัวเลือกด้านล่างบันทึกทันทีที่กด
          </p>
        )}

      </form>

      {/* โหมดแก้ไข: ตัวเลือกเป็น resource แยกใน backend บันทึกทันทีที่กด จึงแยกออกจากฟอร์มให้ชัด
          เดิมอยู่ในฟอร์มเดียวกับปุ่มยกเลิก/บันทึก ผู้ใช้เข้าใจว่ากดยกเลิกแล้วจะย้อนได้ */}
      {item && (
        <div className="mt-6 border-t-2 border-gray-200 pt-4">
          <MenuOptionsEditor menuItemId={item.id} onDraftChange={setOptionDraftDirty} />
        </div>
      )}

      {closeWarned && optionDraftDirty && (
        <p role="alert" className="mt-3 rounded-lg bg-danger/5 px-3 py-2 text-sm font-semibold text-danger-ink">
          ตัวเลือกที่พิมพ์ไว้ยังไม่ได้เพิ่ม กด "+ เพิ่ม" ก่อน หรือกดปิดอีกครั้งเพื่อทิ้ง
        </p>
      )}

        {/* แยกโซนอันตรายไว้ล่างสุด ห่างจากปุ่มบันทึก */}
        {item && onDelete && (
          <div className="mt-6 border-t border-gray-200 pt-4">
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
                {on && (
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" aria-hidden className="mr-1 inline h-3.5 w-3.5 align-[-2px]">
                    <path d="m5 12 5 5 9-10" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                )}
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

function FieldError({ id, message }: Readonly<{ id: string; message: string }>) {
  if (!message) return null
  return (
    <span id={id} role="alert" className="mt-1 block text-sm font-semibold text-danger-ink">
      {message}
    </span>
  )
}
