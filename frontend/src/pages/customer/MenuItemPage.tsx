import { FoodImage } from '@/components/ui/FoodImage'
import { QuantityStepper } from '@/components/ui/QuantityStepper'
import { usePublicMenuItem } from '@/features/public/hooks'
import { useCart, type CartOption } from '@/features/public/cart-store'
import { formatBaht } from '@/lib/format'
import type { MenuOptionGroup } from '@/types/models'
import { useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'

export function CustomerMenuItemPage() {
  const { token, menuItemId } = useParams()
  const navigate = useNavigate()
  const { data: item, isPending, isError, error } = usePublicMenuItem(menuItemId)
  const add = useCart((s) => s.add)

  const [singleChoice, setSingleChoice] = useState<Record<string, string>>({})
  const [multiChoice, setMultiChoice] = useState<Record<string, boolean>>({})
  const [note, setNote] = useState('')
  const [quantity, setQuantity] = useState(1)

  const selectedOptions: CartOption[] = useMemo(() => {
    if (!item) return []
    const picked: CartOption[] = []
    for (const group of item.optionGroups) {
      for (const option of group.options) {
        const isPicked =
          group.selectType === 'single'
            ? singleChoice[group.id] === option.id
            : Boolean(multiChoice[option.id])
        if (isPicked) {
          picked.push({ id: option.id, name: option.name, price: option.price })
        }
      }
    }
    return picked
  }, [item, singleChoice, multiChoice])

  const missingRequired = (item?.optionGroups ?? []).filter(
    (g) => g.required && g.selectType === 'single' && !singleChoice[g.id],
  )

  const unitPrice =
    (item?.price ?? 0) + selectedOptions.reduce((sum, o) => sum + o.price, 0)

  if (isPending) return <p className="text-sm md:text-base text-gray-500">กำลังโหลด...</p>
  if (isError || !item) {
    return (
      <p className="text-sm md:text-base text-danger">
        {error instanceof Error ? error.message : 'ไม่พบเมนูนี้'}
      </p>
    )
  }

  const handleAdd = () => {
    if (missingRequired.length > 0) return
    add({
      menuItemId: item.id,
      name: item.name,
      imageUrl: item.imageUrl,
      basePrice: item.price,
      options: selectedOptions,
      quantity,
      note: note.trim(),
    })
    navigate(`/t/${token}/cart`)
  }

  return (
    <div className="lg:grid lg:grid-cols-2 lg:gap-8">
      {/* รูป */}
      <div className="relative -mx-4 lg:mx-0 lg:self-start">
        <div className="aspect-[4/3] w-full overflow-hidden lg:rounded-2xl">
          <FoodImage src={item.imageUrl} alt={item.name} />
        </div>
        <button
          type="button"
          onClick={() => navigate(-1)}
          aria-label="ย้อนกลับ"
          className="absolute top-3 left-3 flex h-10 w-10 items-center justify-center rounded-full border-2 border-brand-300 bg-white text-lg md:text-xl font-bold text-brand-300 shadow-sm"
        >
          ←
        </button>
      </div>

      {/* ตัวเลือก */}
      <div className="pb-32 lg:pb-0">
        <div className="mt-4 flex items-start justify-between gap-3 lg:mt-0">
          <div>
            <h1 className="text-xl md:text-2xl font-bold text-ink">{item.name}</h1>
          </div>
          <p className="shrink-0 text-xl md:text-2xl font-bold text-price">
            {formatBaht(item.price)}
          </p>
        </div>

        {item.optionGroups.map((group) => (
          <OptionGroupBlock
            key={group.id}
            group={group}
            singleValue={singleChoice[group.id]}
            multiValue={multiChoice}
            onSingle={(optionId) =>
              setSingleChoice((prev) => ({ ...prev, [group.id]: optionId }))
            }
            onMulti={(optionId, checked) =>
              setMultiChoice((prev) => ({ ...prev, [optionId]: checked }))
            }
          />
        ))}

        <label className="mt-5 block">
          <span className="text-sm md:text-base font-semibold text-gray-700">หมายเหตุ</span>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={3}
            maxLength={200}
            placeholder="เช่น ไม่เผ็ด ไม่ใส่ผัก"
            className="mt-2 w-full resize-none rounded-xl border-2 border-brand-75 p-3 text-sm md:text-base outline-none focus:border-brand-300"
          />
        </label>

        {/* แถบสั่ง — ติดล่างจอบนมือถือ, อยู่ในคอลัมน์บนจอใหญ่ */}
        <div className="fixed inset-x-0 bottom-16 z-10 border-t border-brand-75 bg-brand-50 px-4 py-3 lg:static lg:mt-6 lg:rounded-2xl lg:border-2 lg:px-4">
          <div className="mx-auto flex max-w-md items-center gap-3 lg:max-w-none">
            <QuantityStepper value={quantity} onChange={setQuantity} />
            <button
              type="button"
              onClick={handleAdd}
              disabled={missingRequired.length > 0}
              className="flex-1 rounded-full bg-brand-300 py-3 text-sm md:text-base font-bold text-white transition disabled:bg-gray-300"
            >
              {missingRequired.length > 0
                ? `กรุณาเลือก${missingRequired[0].name}`
                : `เพิ่มรายการ ${formatBaht(unitPrice * quantity)}`}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function OptionGroupBlock({
  group,
  singleValue,
  multiValue,
  onSingle,
  onMulti,
}: Readonly<{
  group: MenuOptionGroup
  singleValue: string | undefined
  multiValue: Record<string, boolean>
  onSingle: (optionId: string) => void
  onMulti: (optionId: string, checked: boolean) => void
}>) {
  return (
    <fieldset className="mt-5">
      <legend className="text-sm md:text-base font-semibold text-gray-700">
        {group.name}
        {group.required && <span className="ml-1 text-danger">*</span>}
      </legend>

      <div className="mt-2 space-y-2">
        {group.options.map((option) => {
          const checked =
            group.selectType === 'single'
              ? singleValue === option.id
              : Boolean(multiValue[option.id])

          return (
            <label
              key={option.id}
              className={`flex cursor-pointer items-center justify-between gap-3 rounded-xl border-2 px-4 py-3 transition ${
                checked
                  ? 'border-brand-300 bg-brand-50'
                  : 'border-brand-75 bg-white hover:border-brand-100'
              }`}
            >
              <span className="text-sm md:text-base text-gray-900">
                {option.name}
                {option.price > 0 && (
                  <span className="block text-xs md:text-sm text-gray-500">
                    +{option.price}
                  </span>
                )}
              </span>

              <input
                type={group.selectType === 'single' ? 'radio' : 'checkbox'}
                name={group.id}
                checked={checked}
                onChange={(e) =>
                  group.selectType === 'single'
                    ? onSingle(option.id)
                    : onMulti(option.id, e.target.checked)
                }
                className={`h-5 w-5 shrink-0 accent-brand-300 ${
                  group.selectType === 'single' ? 'rounded-full' : 'rounded'
                }`}
              />
            </label>
          )
        })}
      </div>
    </fieldset>
  )
}
