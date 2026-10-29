import { FoodImage } from '@/components/ui/FoodImage'
import { NoteChips } from '@/components/ui/NoteChips'
import { QuantityStepper } from '@/components/ui/QuantityStepper'
import { usePublicMenuItem } from '@/features/public/hooks'
import { useCart, type CartOption } from '@/features/public/cart-store'
import { formatBaht } from '@/lib/format'
import type { MenuOption, MenuOptionGroup } from '@/types/models'
import { useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'

/** ตัวเลือกที่วัตถุดิบหมด — backend ยังส่งมาให้โชว์ "หมด" แต่สั่งไม่ได้ */
const isSoldOut = (o: MenuOption) => !o.isAvailable || o.ingredientOutOfStock

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
        if (isPicked && !isSoldOut(option)) {
          picked.push({ id: option.id, name: option.name, price: option.price })
        }
      }
    }
    return picked
  }, [item, singleChoice, multiChoice])

  // เนื้อสัตว์หมดทุกตัว = ไม่บังคับเลือก (กติกาเดียวกับ backend) ไม่งั้นลูกค้ากดสั่งไม่ได้เลย
  const missingRequired = (item?.optionGroups ?? []).filter(
    (g) =>
      g.required &&
      g.selectType === 'single' &&
      !singleChoice[g.id] &&
      g.options.some((o) => !isSoldOut(o)),
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
          className="absolute top-3 left-3 flex h-11 w-11 items-center justify-center rounded-full bg-white text-ink shadow-md"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden className="h-5 w-5">
            <path d="M15 5l-7 7 7 7" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </div>

      {/* ตัวเลือก — มือถือเป็นแผ่นมุมโค้งซ้อนขึ้นไปบนรูป */}
      <div className="relative -mx-4 -mt-5 rounded-t-3xl bg-cream px-4 pt-5 pb-36 lg:mx-0 lg:mt-0 lg:rounded-none lg:bg-transparent lg:px-0 lg:pt-0 lg:pb-0">
        <div className="flex items-start justify-between gap-3">
          <h1 className="text-2xl font-bold text-ink">{item.name}</h1>
          <p className="shrink-0 text-xl md:text-2xl font-bold text-price tabular-nums">
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

        <div className="mt-6">
          <span className="text-base font-bold text-ink md:text-lg">หมายเหตุถึงครัว</span>
          <div className="mt-2">
            <NoteChips value={note} onChange={setNote} />
          </div>
        </div>
        <label className="block">
          <span className="sr-only">หมายเหตุเพิ่มเติม</span>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={3}
            maxLength={200}
            placeholder="พิมพ์เพิ่มเองได้ เช่น ข้าวน้อย"
            className="mt-2 w-full resize-none rounded-2xl border-2 border-brand-75 bg-white p-3 text-sm md:text-base outline-none focus:border-brand-500"
          />
        </label>

        {/* แถบสั่ง — มือถือ: ชิดบนเมนูล่าง / แท็บเล็ต (ไม่มีเมนูล่าง): ชิดขอบจอ / จอใหญ่: อยู่ในคอลัมน์ */}
        <div className="fixed inset-x-0 bottom-[calc(4rem+env(safe-area-inset-bottom))] z-10 border-t-2 border-brand-75 bg-white px-4 py-3 md:bottom-0 md:pb-[calc(0.75rem+env(safe-area-inset-bottom))] lg:static lg:mt-6 lg:rounded-2xl lg:border-2 lg:px-4 lg:pb-3">
          <div className="mx-auto flex max-w-md items-center gap-3 lg:max-w-none">
            <QuantityStepper value={quantity} onChange={setQuantity} />
            <button
              type="button"
              onClick={handleAdd}
              disabled={missingRequired.length > 0}
              className="min-h-14 flex-1 rounded-2xl bg-brand-500 px-3 text-base font-bold text-white tabular-nums transition active:scale-[0.98] disabled:bg-gray-200 disabled:text-gray-600 md:text-lg"
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
    <fieldset className="mt-6">
      <legend className="flex items-center gap-2">
        <span className="text-base font-bold text-ink md:text-lg">{group.name}</span>
        {group.required && group.selectType === 'single' && (
          <span className="rounded-full bg-danger-ink px-2 py-0.5 text-xs font-bold text-white">
            ต้องเลือก 1
          </span>
        )}
        {group.selectType !== 'single' && (
          <span className="text-xs font-semibold text-gray-600 md:text-sm">เลือกได้หลายอย่าง</span>
        )}
      </legend>

      <div className="mt-2 space-y-2">
        {group.options.map((option) => {
          const single = group.selectType === 'single'
          const soldOut = isSoldOut(option)
          const checked =
            !soldOut && (single ? singleValue === option.id : Boolean(multiValue[option.id]))

          // ทุกตัวเลือกเป็นแถวขาวขอบหนา เลือกแล้ว = ขอบน้ำตาลพื้นส้มอ่อน — หมด: ขอบประ กดไม่ได้ + ป้าย "หมด"
          let tone: string
          if (soldOut) {
            tone = 'cursor-not-allowed border-dashed border-gray-300 bg-gray-50 text-gray-600'
          } else if (checked) {
            tone = 'cursor-pointer border-brand-500 bg-brand-50 text-text'
          } else {
            tone = 'cursor-pointer border-brand-75 bg-white text-text hover:border-brand-100'
          }

          return (
            <label
              key={option.id}
              className={`flex min-h-13 items-center gap-3 rounded-2xl border-2 px-4 py-2 transition ${tone}`}
            >
              {soldOut ? (
                <span className="flex-1 text-sm font-semibold md:text-base">{option.name}</span>
              ) : (
                <>
                  <input
                    type={single ? 'radio' : 'checkbox'}
                    name={group.id}
                    checked={checked}
                    onChange={(e) =>
                      single ? onSingle(option.id) : onMulti(option.id, e.target.checked)
                    }
                    className="peer sr-only"
                  />
                  {/* วาดปุ่มเองให้ตรงดีไซน์ — input จริงซ่อนไว้ (sr-only) ยังกด/โฟกัสด้วยคีย์บอร์ดได้ */}
                  <span
                    aria-hidden
                    className={`flex h-6 w-6 shrink-0 items-center justify-center border-2 peer-focus-visible:ring-2 peer-focus-visible:ring-brand-300 peer-focus-visible:ring-offset-2 ${
                      single
                        ? `rounded-full bg-white ${checked ? 'border-brand-500' : 'border-gray-500'}`
                        : `rounded-md ${checked ? 'border-brand-500 bg-brand-500' : 'border-gray-500 bg-white'}`
                    }`}
                  >
                    {single && checked && <span className="h-3 w-3 rounded-full bg-brand-500" />}
                    {!single && checked && (
                      <svg
                        viewBox="0 0 16 16"
                        className="h-4 w-4 text-white"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2.5"
                      >
                        <path d="M3 8.5l3 3 7-7" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    )}
                  </span>
                  <span className="flex-1 text-sm font-semibold md:text-base">{option.name}</span>
                </>
              )}

              {soldOut ? (
                <span className="shrink-0 rounded-full bg-danger-ink px-2.5 py-0.5 text-xs font-bold text-white">
                  หมด
                </span>
              ) : (
                option.price > 0 && (
                  <span className="shrink-0 text-sm font-bold text-gray-700 tabular-nums md:text-base">
                    +{formatBaht(option.price)}
                  </span>
                )
              )}
            </label>
          )
        })}
      </div>
    </fieldset>
  )
}
