import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { ErrorNote } from '@/components/ui/ErrorNote'
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
import { useState } from 'react'

const GROUP_LABEL: Record<MenuOptionGroupKind, string> = {
  [MenuOptionGroupKind.PROTEIN]: 'เนื้อสัตว์ (เลือกได้ 1)',
  [MenuOptionGroupKind.EXTRA]: 'เพิ่มเติม (เลือกได้หลายอย่าง)',
}

const inputClass =
  'rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-brand-300'

/**
 * จัดการตัวเลือกของเมนู (หมู/ไก่/ไข่ดาว) — เพิ่ม, แก้, เปิด-ปิดให้เลือก, ลบ
 * ทุกปุ่มยิง API ทันที ไม่รอปุ่ม "บันทึก" ของฟอร์มเมนู เพราะตัวเลือกเป็น resource แยกใน backend
 * อ่านข้อมูลสดจาก useMenuItem ไม่ใช่ prop เพราะหลังเพิ่ม/แก้ต้องเห็นผลทันทีโดยไม่ปิด dialog
 */
export function MenuOptionsEditor({ menuItemId }: { menuItemId: Id }) {
  const { data: item } = useMenuItem(menuItemId)
  const createOption = useCreateMenuOption()
  const updateOption = useUpdateMenuOption()
  const deleteOption = useDeleteMenuOption()

  /** ตัวเลือกที่กำลังถามยืนยันว่าจะลบ */
  const [deleting, setDeleting] = useState<MenuOption | null>(null)

  const options = item?.optionGroups.flatMap((g) => g.options) ?? []
  const busy =
    createOption.isPending || updateOption.isPending || deleteOption.isPending
  const error = createOption.error ?? updateOption.error ?? deleteOption.error

  return (
    <section className="rounded-xl border border-gray-200 bg-gray-50 p-3">
      <h3 className="text-sm font-bold text-gray-800">ตัวเลือกของเมนู</h3>
      <p className="mt-0.5 text-xs text-gray-500">
        ปิดสวิตช์ = ลูกค้าจะไม่เห็นตัวเลือกนั้น (ใช้ตอนของหมดชั่วคราว) ·
        ผูกวัตถุดิบไว้ = ของหมดทีเดียวหายทุกเมนู
      </p>

      <div className="mt-2">
        <ErrorNote error={error} />
      </div>

      {(Object.keys(GROUP_LABEL) as MenuOptionGroupKind[]).map((group) => {
        const rows = options.filter((o) => o.group === group)
        if (rows.length === 0) return null
        return (
          <div key={group} className="mt-3">
            <p className="text-xs font-semibold text-gray-600">{GROUP_LABEL[group]}</p>
            <ul className="mt-1 space-y-1.5">
              {rows.map((option) => (
                <OptionRow
                  key={option.id}
                  option={option}
                  disabled={busy}
                  onToggle={(isAvailable) =>
                    updateOption.mutate({
                      menuItemId,
                      optionId: option.id,
                      input: { isAvailable },
                    })
                  }
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
        <p className="mt-3 text-xs text-gray-400">ยังไม่มีตัวเลือก</p>
      )}

      <NewOptionRow
        disabled={busy}
        onAdd={(input) => createOption.mutate({ menuItemId, input })}
        usedIngredientIds={options
          .map((o) => o.ingredientId)
          .filter((id): id is Id => Boolean(id))}
      />

      {deleting && (
        <ConfirmDialog
          title="ลบตัวเลือก"
          subject={deleting.name}
          detail={
            deleting.price > 0 ? `เพิ่มเงิน ${formatBaht(deleting.price)}` : 'ไม่มีค่าใช้จ่ายเพิ่ม'
          }
          consequence="ถ้าตัวเลือกนี้เคยถูกสั่งไปแล้วจะลบไม่ได้ — ให้ปิดสวิตช์แทนเพื่อซ่อนจากลูกค้า"
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
}: {
  options: MenuOptionInput[]
  onChange: (next: MenuOptionInput[]) => void
}) {
  return (
    <section className="rounded-xl border border-gray-200 bg-gray-50 p-3">
      <h3 className="text-sm font-bold text-gray-800">ตัวเลือกของเมนู</h3>
      <p className="mt-0.5 text-xs text-gray-500">
        ใส่ไว้ก่อนได้เลย จะถูกบันทึกพร้อมเมนูตอนกด "บันทึก"
      </p>

      {(Object.keys(GROUP_LABEL) as MenuOptionGroupKind[]).map((group) => {
        const rows = options
          .map((o, index) => ({ o, index }))
          .filter(({ o }) => o.group === group)
        if (rows.length === 0) return null
        return (
          <div key={group} className="mt-3">
            <p className="text-xs font-semibold text-gray-600">{GROUP_LABEL[group]}</p>
            <ul className="mt-1 space-y-1.5">
              {rows.map(({ o, index }) => (
                <li
                  key={index}
                  className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2"
                >
                  <span className="min-w-0 flex-1 truncate text-sm text-gray-900">
                    {o.name}
                    {o.price > 0 && (
                      <span className="ml-1 text-xs text-gray-500">+{formatBaht(o.price)}</span>
                    )}
                  </span>
                  <button
                    type="button"
                    onClick={() => onChange(options.filter((_, i) => i !== index))}
                    className="text-xs font-semibold text-danger hover:underline"
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
        <p className="mt-3 text-xs text-gray-400">ยังไม่มีตัวเลือก</p>
      )}

      <NewOptionRow
        disabled={false}
        onAdd={(input) => onChange([...options, input])}
        usedIngredientIds={options
          .map((o) => o.ingredientId)
          .filter((id): id is Id => Boolean(id))}
      />
    </section>
  )
}

function OptionRow({
  option,
  disabled,
  onToggle,
  onSave,
  onDelete,
}: {
  option: MenuOption
  disabled: boolean
  onToggle: (isAvailable: boolean) => void
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

  if (editing) {
    return (
      <li className="flex flex-wrap items-center gap-2 rounded-lg border border-brand-200 bg-white p-2">
        <select
          value={group}
          onChange={(e) => setGroup(e.target.value as MenuOptionGroupKind)}
          className={inputClass}
        >
          <option value={MenuOptionGroupKind.PROTEIN}>เนื้อสัตว์</option>
          <option value={MenuOptionGroupKind.EXTRA}>เพิ่มเติม</option>
        </select>

        {/* เนื้อสัตว์ต้องอ้างวัตถุดิบกลางเสมอ ชื่อจึงมาจากวัตถุดิบ ไม่ให้พิมพ์เอง */}
        {isProtein ? (
          <select
            value={ingredientId}
            onChange={(e) => setIngredientId(e.target.value)}
            title="ของหมดที่หน้าวัตถุดิบแล้วตัวเลือกนี้จะหายจากทุกเมนูที่ใช้"
            className={`${inputClass} min-w-0 flex-1`}
          >
            <option value="">เลือกวัตถุดิบ</option>
            {ingredients?.map((ing) => (
              <option key={ing.id} value={ing.id}>
                {ing.name}
                {ing.isAvailable ? '' : ' (ตอนนี้ของหมด)'}
              </option>
            ))}
          </select>
        ) : (
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className={`${inputClass} min-w-0 flex-1`}
            placeholder="ชื่อตัวเลือก"
          />
        )}

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
              ingredientId: isProtein ? ingredientId : null,
            })
            setEditing(false)
          }}
          className="rounded-lg bg-brand-300 px-3 py-1.5 text-xs font-bold text-white hover:bg-brand-400 disabled:opacity-50"
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
          className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-bold text-gray-600 hover:bg-gray-50"
        >
          ยกเลิก
        </button>
      </li>
    )
  }

  return (
    <li
      className={`flex items-center gap-2 rounded-lg border bg-white px-3 py-2 ${
        option.isAvailable ? 'border-gray-200' : 'border-dashed border-gray-300 opacity-60'
      }`}
    >
      <span className="min-w-0 flex-1 truncate text-sm text-gray-900">
        {option.name}
        {option.ingredientName && (
          <span
            className={`ml-1 text-xs ${
              option.ingredientOutOfStock ? 'font-semibold text-danger' : 'text-gray-400'
            }`}
          >
            [{option.ingredientName}
            {option.ingredientOutOfStock ? ' — หมด' : ''}]
          </span>
        )}
        {/* เนื้อสัตว์ที่ไม่ได้ผูกวัตถุดิบจะปิดตามของหมดไม่ได้ ต้องไล่ปิดเองทีละเมนู */}
        {option.group === MenuOptionGroupKind.PROTEIN && !option.ingredientId && (
          <span
            title="กด 'แก้' แล้วเลือกวัตถุดิบ เพื่อให้ปิดของหมดทีเดียวแล้วหายทุกเมนู"
            className="ml-1 rounded bg-amber-100 px-1.5 py-0.5 text-xs font-semibold text-amber-800"
          >
            ยังไม่ผูกวัตถุดิบ
          </span>
        )}
        {option.price > 0 && (
          <span className="ml-1 text-xs text-gray-500">+{formatBaht(option.price)}</span>
        )}
        {!option.isAvailable && (
          <span className="ml-2 text-xs font-semibold text-gray-500">ปิดอยู่</span>
        )}
      </span>

      {/* สวิตช์เปิด/ปิดให้ลูกค้าเลือก */}
      <button
        type="button"
        role="switch"
        aria-checked={option.isAvailable}
        aria-label={option.isAvailable ? 'ปิดตัวเลือกนี้' : 'เปิดตัวเลือกนี้'}
        disabled={disabled}
        onClick={() => onToggle(!option.isAvailable)}
        className={`relative h-6 w-11 shrink-0 rounded-full transition disabled:opacity-50 ${
          option.isAvailable ? 'bg-brand-300' : 'bg-gray-300'
        }`}
      >
        <span
          className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition ${
            option.isAvailable ? 'left-[22px]' : 'left-0.5'
          }`}
        />
      </button>

      <button
        type="button"
        disabled={disabled}
        onClick={() => setEditing(true)}
        className="text-xs font-semibold text-brand-400 hover:underline disabled:opacity-50"
      >
        แก้
      </button>
      <button
        type="button"
        disabled={disabled}
        onClick={onDelete}
        className="text-xs font-semibold text-danger hover:underline disabled:opacity-50"
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
 * - เพิ่มเติม (EXTRA) = พิมพ์เองได้ เพราะเป็นของเฉพาะเมนูนั้น (ไข่ดาว/พิเศษ)
 */
function NewOptionRow({
  disabled,
  onAdd,
  /** ตัวเลือกที่มีอยู่แล้ว ใช้กันเลือกวัตถุดิบซ้ำในเมนูเดียวกัน */
  usedIngredientIds = [],
}: Readonly<{
  disabled: boolean
  onAdd: (input: MenuOptionInput) => void
  usedIngredientIds?: readonly Id[]
}>) {
  const { data: ingredients } = useIngredients()
  const [name, setName] = useState('')
  const [price, setPrice] = useState('')
  const [group, setGroup] = useState<MenuOptionGroupKind>(MenuOptionGroupKind.EXTRA)
  const [ingredientId, setIngredientId] = useState('')

  const isProtein = group === MenuOptionGroupKind.PROTEIN
  const available = (ingredients ?? []).filter(
    (ing) => !usedIngredientIds.includes(ing.id),
  )
  const chosen = available.find((ing) => ing.id === ingredientId)
  const canSubmit = isProtein ? Boolean(chosen) : Boolean(name.trim())

  const submit = () => {
    if (!canSubmit) return
    onAdd(
      isProtein
        ? {
            name: chosen!.name,
            price: Number(price) || 0,
            group,
            isAvailable: true,
            ingredientId: chosen!.id,
          }
        : {
            name: name.trim(),
            price: Number(price) || 0,
            group,
            isAvailable: true,
            ingredientId: null,
          },
    )
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
          className={inputClass}
        >
          <option value={MenuOptionGroupKind.PROTEIN}>เนื้อสัตว์</option>
          <option value={MenuOptionGroupKind.EXTRA}>เพิ่มเติม</option>
        </select>

        {isProtein ? (
          <select
            value={ingredientId}
            onChange={(e) => setIngredientId(e.target.value)}
            className={`${inputClass} min-w-0 flex-1`}
          >
            <option value="">เลือกวัตถุดิบ</option>
            {available.map((ing) => (
              <option key={ing.id} value={ing.id}>
                {ing.name}
                {ing.isAvailable ? '' : ' (ตอนนี้ของหมด)'}
              </option>
            ))}
          </select>
        ) : (
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={onEnter}
            className={`${inputClass} min-w-0 flex-1`}
            placeholder="เพิ่มตัวเลือก เช่น ไข่ดาว"
          />
        )}

        <input
          type="number"
          min="0"
          step="1"
          value={price}
          onChange={(e) => setPrice(e.target.value)}
          onKeyDown={onEnter}
          className={`${inputClass} w-20`}
          placeholder="+บาท"
        />
        <button
          type="button"
          disabled={disabled || !canSubmit}
          onClick={submit}
          className="rounded-lg border-2 border-brand-300 px-3 py-1.5 text-xs font-bold text-brand-400 hover:bg-brand-50 disabled:opacity-50"
        >
          + เพิ่ม
        </button>
      </div>

      {isProtein && available.length === 0 && (
        <p className="mt-2 text-xs text-gray-500">
          {ingredients?.length
            ? 'วัตถุดิบทุกตัวถูกใช้ในเมนูนี้แล้ว'
            : 'ยังไม่มีวัตถุดิบ — เพิ่มได้ที่แท็บ "วัตถุดิบ" ก่อน'}
        </p>
      )}
    </div>
  )
}
