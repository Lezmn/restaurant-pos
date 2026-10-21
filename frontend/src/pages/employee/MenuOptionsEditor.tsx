import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { ErrorNote } from '@/components/ui/ErrorNote'
import { button } from '@/components/ui/styles'
import {
  useCreateMenuOption,
  useDeleteMenuOption,
  useMenuItem,
  useUpdateMenuOption,
} from '@/features/menu/hooks'
import type { MenuOptionInput } from '@/features/menu/api'
import { useIngredients } from '@/features/ingredients/hooks'
import { formatBaht } from '@/lib/format'
import { MenuOptionGroupKind } from '@/types/enums'
import type { Id, MenuOption } from '@/types/models'
import { useEffect, useState } from 'react'

const GROUP_LABEL: Record<MenuOptionGroupKind, string> = {
  [MenuOptionGroupKind.PROTEIN]: 'เนื้อสัตว์ (เลือกได้ 1)',
  [MenuOptionGroupKind.EXTRA]: 'เพิ่มเติม (เลือกได้หลายอย่าง)',
}

const inputClass =
  'min-h-11 rounded-lg border border-gray-300 bg-white px-3 py-2 text-base outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-400/25'

/**
 * จัดการตัวเลือกของเมนู (หมู/ไก่/ไข่ดาว) — เพิ่ม, แก้, ลบ
 * ไม่มีสวิตช์เปิด/ปิดรายตัวเลือก ของหมดให้ปิดที่วัตถุดิบที่เดียว
 * ทุกปุ่มยิง API ทันที ไม่รอปุ่ม "บันทึก" ของฟอร์มเมนู เพราะตัวเลือกเป็น resource แยกใน backend
 * อ่านข้อมูลสดจาก useMenuItem ไม่ใช่ prop เพราะหลังเพิ่ม/แก้ต้องเห็นผลทันทีโดยไม่ปิด dialog
 */
export function MenuOptionsEditor({
  menuItemId,
  onDraftChange,
}: {
  menuItemId: Id
  /** แถวเพิ่มตัวเลือกมีข้อความค้างหรือไม่ — ฟอร์มใช้เตือนก่อนปิด */
  onDraftChange?: (dirty: boolean) => void
}) {
  const { data: item } = useMenuItem(menuItemId)
  const createOption = useCreateMenuOption()
  const updateOption = useUpdateMenuOption()
  const deleteOption = useDeleteMenuOption()

  /** ตัวเลือกที่กำลังถามยืนยันว่าจะลบ */
  const [deleting, setDeleting] = useState<MenuOption | null>(null)

  // isAvailable = false คือตัวเลือกที่ลบไปแล้วแต่เคยถูกสั่ง (เก็บไว้ให้ประวัติออเดอร์) ไม่ต้องโชว์
  const options = (item?.optionGroups.flatMap((g) => g.options) ?? []).filter(
    (o) => o.isAvailable,
  )
  const busy =
    createOption.isPending || updateOption.isPending || deleteOption.isPending
  const error = createOption.error ?? updateOption.error ?? deleteOption.error

  return (
    <section aria-labelledby="options-heading">
      <div className="flex flex-wrap items-center gap-2">
        <h3 id="options-heading" className="text-base font-bold text-black">
          ตัวเลือกของเมนู
        </h3>
        <span className="rounded-full bg-gray-100 px-2.5 py-0.5 text-sm font-semibold text-gray-700">
          บันทึกทันทีทุกครั้งที่กด
        </span>
      </div>
      <p className="mt-1 text-sm text-gray-600">
        ของหมดให้ปิดที่แท็บ "วัตถุดิบ" ที่เดียว ตัวเลือกที่ผูกไว้จะหายทุกเมนู ·
        ตัวเลือกที่ไม่ผูกวัตถุดิบ (เช่น พิเศษ) เปิดขายตลอด
      </p>

      <div className="mt-2">
        <ErrorNote error={error} />
      </div>

      {(Object.keys(GROUP_LABEL) as MenuOptionGroupKind[]).map((group) => {
        const rows = options.filter((o) => o.group === group)
        if (rows.length === 0) return null
        return (
          <div key={group} className="mt-3">
            <p className="text-sm font-semibold text-gray-600">{GROUP_LABEL[group]}</p>
            <ul className="mt-1 space-y-1.5">
              {rows.map((option) => (
                <OptionRow
                  key={option.id}
                  option={option}
                  disabled={busy}
                  onSave={(input) =>
                    updateOption.mutate({ menuItemId, optionId: option.id, input })
                  }
                  onDelete={() => setDeleting(option)}
                />
              ))}
            </ul>
          </div>
        )
      })}

      {options.length === 0 && (
        <p className="mt-3 text-sm text-gray-600">ยังไม่มีตัวเลือก</p>
      )}

      <NewOptionRow
        disabled={busy}
        onAdd={(input) => createOption.mutate({ menuItemId, input })}
        usedIngredientIds={proteinIngredientIds(options)}
        usedNames={options.map((o) => o.name)}
        onDraftChange={onDraftChange}
      />

      {deleting && (
        <ConfirmDialog
          title="ลบตัวเลือก"
          subject={deleting.name}
          detail={
            deleting.price > 0 ? `เพิ่มเงิน ${formatBaht(deleting.price)}` : 'ไม่มีค่าใช้จ่ายเพิ่ม'
          }
          consequence={
            deleting.ingredientId
              ? 'ตัวเลือกจะหายจากเมนูนี้ (ประวัติออเดอร์ยังอยู่ครบ) — ถ้าแค่ของหมด ให้ปิดที่แท็บ "วัตถุดิบ" แทน'
              : 'ตัวเลือกจะหายจากเมนูนี้ (ประวัติออเดอร์ยังอยู่ครบ)'
          }
          confirmLabel="ลบตัวเลือก"
          pendingLabel="กำลังลบ..."
          isPending={deleteOption.isPending}
          error={deleteOption.error}
          onCancel={() => setDeleting(null)}
          onConfirm={() =>
            deleteOption.mutate(
              { menuItemId, optionId: deleting.id },
              { onSuccess: () => setDeleting(null) },
            )
          }
        />
      )}
    </section>
  )
}

/**
 * โหมด "เพิ่มเมนูใหม่" — ยังไม่มี id เมนูให้ยิง API จึงพักตัวเลือกไว้ใน state ของฟอร์มก่อน
 * ManagePage จะสร้างตัวเลือกพวกนี้ต่อท้ายทันทีหลังบันทึกเมนูสำเร็จ
 */
export function PendingOptionsEditor({
  options,
  onChange,
  onDraftChange,
}: {
  options: MenuOptionInput[]
  onChange: (next: MenuOptionInput[]) => void
  onDraftChange?: (dirty: boolean) => void
}) {
  return (
    <section className="rounded-xl border border-gray-200 bg-gray-50 p-3">
      <h3 className="text-sm font-bold text-gray-800">ตัวเลือกของเมนู</h3>
      <p className="mt-0.5 text-sm text-gray-600">
        ใส่ไว้ก่อนได้เลย จะถูกบันทึกพร้อมเมนูตอนกด "บันทึก"
      </p>

      {(Object.keys(GROUP_LABEL) as MenuOptionGroupKind[]).map((group) => {
        const rows = options
          .map((o, index) => ({ o, index }))
          .filter(({ o }) => o.group === group)
        if (rows.length === 0) return null
        return (
          <div key={group} className="mt-3">
            <p className="text-sm font-semibold text-gray-600">{GROUP_LABEL[group]}</p>
            <ul className="mt-1 space-y-1.5">
              {rows.map(({ o, index }) => (
                <li
                  key={index}
                  className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2"
                >
                  <span className="min-w-0 flex-1 truncate text-sm text-gray-900">
                    {o.name}
                    {o.price > 0 && (
                      <span className="ml-1 text-sm text-gray-600">+{formatBaht(o.price)}</span>
                    )}
                  </span>
                  <button
                    type="button"
                    aria-label={`ลบตัวเลือก ${o.name}`}
                    onClick={() => onChange(options.filter((_, i) => i !== index))}
                    className={button('danger-outline', 'sm')}
                  >
                    ลบ
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )
      })}

      {options.length === 0 && (
        <p className="mt-3 text-sm text-gray-600">ยังไม่มีตัวเลือก</p>
      )}

      <NewOptionRow
        disabled={false}
        onAdd={(input) => onChange([...options, input])}
        usedIngredientIds={proteinIngredientIds(options)}
        usedNames={options.map((o) => o.name)}
        onDraftChange={onDraftChange}
      />
    </section>
  )
}

/** วัตถุดิบที่ใช้เป็นเนื้อสัตว์ในเมนูนี้แล้ว — กันมี "หมู" สองอันในกลุ่มเลือกได้ 1 */
function proteinIngredientIds(options: readonly { group: MenuOptionGroupKind; ingredientId?: Id | null }[]) {
  return options
    .filter((o) => o.group === MenuOptionGroupKind.PROTEIN)
    .map((o) => o.ingredientId)
    .filter((id): id is Id => Boolean(id))
}

/**
 * ช่องเลือกวัตถุดิบ — เนื้อสัตว์ต้องเลือก (ชื่อตัวเลือกมาจากวัตถุดิบ)
 * ส่วนเพิ่มเติมเลือกหรือไม่ก็ได้ (ไข่ดาว → ไข่ / พิเศษ → ไม่ผูก)
 */
function IngredientSelect({
  value,
  onChange,
  required,
  excludeIds = [],
}: Readonly<{
  value: string
  onChange: (id: string) => void
  required: boolean
  excludeIds?: readonly Id[]
}>) {
  const { data: ingredients } = useIngredients()
  const choices = (ingredients ?? []).filter(
    (ing) => ing.id === value || !excludeIds.includes(ing.id),
  )
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      aria-label="วัตถุดิบที่ใช้"
      title="ของหมดที่แท็บวัตถุดิบแล้วตัวเลือกนี้จะหายจากทุกเมนูที่ใช้"
      className={`${inputClass} ${required ? 'min-w-0 flex-1' : 'w-36'}`}
    >
      <option value="">{required ? 'เลือกวัตถุดิบ' : 'ไม่ผูกวัตถุดิบ'}</option>
      {choices.map((ing) => (
        <option key={ing.id} value={ing.id}>
          {ing.name}
          {ing.isAvailable ? '' : ' (ตอนนี้ของหมด)'}
        </option>
      ))}
    </select>
  )
}

function OptionRow({
  option,
  disabled,
  onSave,
  onDelete,
}: {
  option: MenuOption
  disabled: boolean
  onSave: (input: {
    name: string
    price: number
    group: MenuOptionGroupKind
    ingredientId: Id | null
  }) => void
  onDelete: () => void
}) {
  const { data: ingredients } = useIngredients()
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(option.name)
  const [price, setPrice] = useState(String(option.price))
  const [group, setGroup] = useState<MenuOptionGroupKind>(option.group)
  const [ingredientId, setIngredientId] = useState(option.ingredientId ?? '')

  const isProtein = group === MenuOptionGroupKind.PROTEIN
  const chosen = ingredients?.find((ing) => ing.id === ingredientId)
  const canSave = isProtein ? Boolean(chosen) : Boolean(name.trim())
  const linked = Boolean(option.ingredientId)

  if (editing) {
    return (
      <li className="flex flex-wrap items-center gap-2 rounded-lg border border-brand-200 bg-white p-2">
        <select
          value={group}
          onChange={(e) => setGroup(e.target.value as MenuOptionGroupKind)}
          aria-label="กลุ่มตัวเลือก"
          className={inputClass}
        >
          <option value={MenuOptionGroupKind.PROTEIN}>เนื้อสัตว์</option>
          <option value={MenuOptionGroupKind.EXTRA}>เพิ่มเติม</option>
        </select>

        {/* เนื้อสัตว์ต้องอ้างวัตถุดิบกลางเสมอ ชื่อจึงมาจากวัตถุดิบ ไม่ให้พิมพ์เอง */}
        {!isProtein && (
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className={`${inputClass} min-w-0 flex-1`}
            placeholder="ชื่อตัวเลือก"
          />
        )}
        <IngredientSelect value={ingredientId} onChange={setIngredientId} required={isProtein} />

        <input
          type="number"
          min="0"
          step="1"
          value={price}
          onChange={(e) => setPrice(e.target.value)}
          className={`${inputClass} w-20`}
          placeholder="+บาท"
        />
        <button
          type="button"
          disabled={disabled || !canSave}
          onClick={() => {
            onSave({
              name: isProtein ? chosen!.name : name.trim(),
              price: Number(price) || 0,
              group,
              ingredientId: ingredientId || null,
            })
            setEditing(false)
          }}
          className={button('primary', 'sm')}
        >
          บันทึก
        </button>
        <button
          type="button"
          onClick={() => {
            setName(option.name)
            setPrice(String(option.price))
            setGroup(option.group)
            setIngredientId(option.ingredientId ?? '')
            setEditing(false)
          }}
          className={button('secondary', 'sm')}
        >
          ยกเลิก
        </button>
      </li>
    )
  }

  const closed = linked && option.ingredientOutOfStock

  return (
    <li
      className={`flex items-center gap-2 rounded-lg border bg-white px-3 py-2 ${
        closed ? 'border-gray-300 bg-gray-50' : 'border-gray-200'
      }`}
    >
      <span className="min-w-0 flex-1 truncate text-sm text-gray-900">
        {option.name}
        {/* เนื้อสัตว์ที่ไม่ได้ผูกวัตถุดิบจะปิดตามของหมดไม่ได้ ต้องไล่ปิดเองทีละเมนู */}
        {option.group === MenuOptionGroupKind.PROTEIN && !linked && (
          <span
            title="กด 'แก้ไข' แล้วเลือกวัตถุดิบ เพื่อให้ปิดของหมดทีเดียวแล้วหายทุกเมนู"
            className="ml-1 rounded bg-amber-100 px-1.5 py-0.5 text-sm font-semibold text-amber-800"
          >
            ยังไม่ผูกวัตถุดิบ
          </span>
        )}
        {option.price > 0 && (
          <span className="ml-1 text-sm text-gray-600">+{formatBaht(option.price)}</span>
        )}
      </span>

      {/* เปิด/ปิดที่แท็บวัตถุดิบที่เดียว ตรงนี้บอกสถานะอย่างเดียว */}
      {linked && (
        <span
          title='เปิด/ปิดที่แท็บ "วัตถุดิบ"'
          className={`shrink-0 rounded-full px-2.5 py-1 text-sm font-semibold ${
            option.ingredientOutOfStock
              ? 'bg-danger/10 text-danger-ink'
              : 'bg-gray-100 text-gray-700'
          }`}
        >
          {/* ชื่อตรงกับวัตถุดิบ (หมู) ไม่ต้องซ้ำ บอกแค่สถานะ ชื่อต่างกัน (ไข่ดาว → ไข่) ค่อยบอกว่าผูกกับอะไร */}
          {option.ingredientName !== option.name && `${option.ingredientName} · `}
          {option.ingredientOutOfStock ? 'หมด' : 'มีของ'}
        </span>
      )}

      <button
        type="button"
        disabled={disabled}
        onClick={() => setEditing(true)}
        aria-label={`แก้ไขตัวเลือก ${option.name}`}
        className={button('outline', 'sm')}
      >
        แก้ไข
      </button>
      <button
        type="button"
        disabled={disabled}
        onClick={onDelete}
        aria-label={`ลบตัวเลือก ${option.name}`}
        className={button('danger-outline', 'sm')}
      >
        ลบ
      </button>
    </li>
  )
}

/**
 * แถวเพิ่มตัวเลือกใหม่
 * - เนื้อสัตว์ (PROTEIN) = เลือกจากวัตถุดิบในหน้า "วัตถุดิบ" เท่านั้น ชื่อมาจากวัตถุดิบ
 *   เพื่อให้ปิดของหมดทีเดียวแล้วหายทุกเมนู ไม่ใช่ต่างเมนูต่างมี "หมู" ของตัวเอง
 * - เพิ่มเติม (EXTRA) = พิมพ์ชื่อเอง แล้วจะผูกวัตถุดิบหรือไม่ก็ได้ (ไข่ดาว → ไข่ / พิเศษ → ไม่ผูก)
 */
function NewOptionRow({
  disabled,
  onAdd,
  /** วัตถุดิบที่เป็นเนื้อสัตว์ในเมนูนี้แล้ว ใช้กันเลือกซ้ำ */
  usedIngredientIds = [],
  /** ชื่อตัวเลือกที่มีในเมนูนี้แล้ว — ชื่อซ้ำลูกค้า/ครัวแยกไม่ออก (backend ตอบ 409) */
  usedNames = [],
  onDraftChange,
}: Readonly<{
  disabled: boolean
  onAdd: (input: MenuOptionInput) => void
  usedIngredientIds?: readonly Id[]
  usedNames?: readonly string[]
  onDraftChange?: (dirty: boolean) => void
}>) {
  const { data: ingredients } = useIngredients()
  const [name, setName] = useState('')
  const [price, setPrice] = useState('')
  const [group, setGroup] = useState<MenuOptionGroupKind>(MenuOptionGroupKind.EXTRA)
  const [ingredientId, setIngredientId] = useState('')

  const isProtein = group === MenuOptionGroupKind.PROTEIN
  const proteinChoices = (ingredients ?? []).filter(
    (ing) => !usedIngredientIds.includes(ing.id),
  )
  const chosen = ingredients?.find((ing) => ing.id === ingredientId)
  const draftName = (isProtein ? (chosen?.name ?? '') : name).trim().toLowerCase()
  const duplicate = Boolean(draftName) && usedNames.some((n) => n.trim().toLowerCase() === draftName)
  const canSubmit =
    !duplicate &&
    (isProtein ? Boolean(chosen && !usedIngredientIds.includes(chosen.id)) : Boolean(name.trim()))

  // พิมพ์/เลือกค้างไว้แต่ยังไม่กด "+ เพิ่ม" — เดิมหายเงียบ ๆ ตอนบันทึกเมนูหรือปิดกล่อง
  const dirty = Boolean(name.trim() || price.trim() || ingredientId)
  useEffect(() => {
    onDraftChange?.(dirty)
  }, [dirty, onDraftChange])

  const submit = () => {
    if (!canSubmit) return
    onAdd({
      name: isProtein ? chosen!.name : name.trim(),
      price: Number(price) || 0,
      group,
      isAvailable: true,
      ingredientId: ingredientId || null,
    })
    setName('')
    setPrice('')
    setIngredientId('')
  }

  const onEnter = (e: { key: string; preventDefault: () => void }) => {
    // Enter ในช่องนี้ต้องเพิ่มตัวเลือก ไม่ใช่ submit ฟอร์มเมนูทั้งใบ
    if (e.key === 'Enter') {
      e.preventDefault()
      submit()
    }
  }

  return (
    <div className="mt-3 border-t border-gray-200 pt-3">
      <div className="flex flex-wrap items-center gap-2">
        <select
          value={group}
          onChange={(e) => setGroup(e.target.value as MenuOptionGroupKind)}
          aria-label="กลุ่มตัวเลือก"
          className={inputClass}
        >
          <option value={MenuOptionGroupKind.PROTEIN}>เนื้อสัตว์</option>
          <option value={MenuOptionGroupKind.EXTRA}>เพิ่มเติม</option>
        </select>

        {!isProtein && (
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={onEnter}
            data-option-draft
            aria-label="ชื่อตัวเลือกใหม่"
            className={`${inputClass} min-w-0 flex-1`}
            placeholder="เช่น ไข่ดาว"
          />
        )}
        <IngredientSelect
          value={ingredientId}
          onChange={setIngredientId}
          required={isProtein}
          excludeIds={isProtein ? usedIngredientIds : []}
        />

        <input
          type="number"
          min="0"
          step="1"
          value={price}
          onChange={(e) => setPrice(e.target.value)}
          onKeyDown={onEnter}
          aria-label="ราคาเพิ่ม (บาท)"
          className={`${inputClass} w-20`}
          placeholder="+บาท"
        />
        <button
          type="button"
          disabled={disabled || !canSubmit}
          onClick={submit}
          className={button('outline', 'sm')}
        >
          + เพิ่ม
        </button>
      </div>

      {duplicate ? (
        <p role="alert" className="mt-2 text-sm font-semibold text-danger-ink">
          เมนูนี้มีตัวเลือกชื่อนี้แล้ว
        </p>
      ) : (
        dirty && (
          <p className="mt-2 text-sm font-semibold text-amber-800">
            ยังไม่ได้เพิ่ม — กด "+ เพิ่ม" หรือ Enter
          </p>
        )
      )}

      {isProtein && proteinChoices.length === 0 && (
        <p className="mt-2 text-sm text-gray-600">
          {ingredients?.length
            ? 'วัตถุดิบทุกตัวถูกใช้เป็นเนื้อสัตว์ในเมนูนี้แล้ว'
            : 'ยังไม่มีวัตถุดิบ — เพิ่มได้ที่แท็บ "วัตถุดิบ" ก่อน'}
        </p>
      )}
    </div>
  )
}
