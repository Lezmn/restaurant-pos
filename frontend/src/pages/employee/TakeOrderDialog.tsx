import { ErrorNote } from '@/components/ui/ErrorNote'
import { Modal } from '@/components/ui/Modal'
import { QuantityStepper } from '@/components/ui/QuantityStepper'
import { useMenuItems } from '@/features/menu/hooks'
import { useCreateOrder } from '@/features/orders/hooks'
import { formatBaht } from '@/lib/format'
import type {
  Id,
  MenuItem,
  MenuOptionGroup,
  TableSession,
} from '@/types/models'
import { useMemo, useRef, useState } from 'react'

/** หนึ่งบรรทัดในรายการที่รับ — เมนูเดียวกันคนละตัวเลือก (หมู/ไก่) แยกบรรทัดกัน */
interface DraftLine {
  key: number
  menuItemId: Id
  quantity: number
  note: string
  /** เนื้อสัตว์: group.id → option.id (เลือกได้อันเดียว) */
  single: Record<string, Id>
  /** เพิ่มเติม: option.id ที่ติ๊กไว้ */
  multi: Id[]
}

/**
 * หน้าพนักงานได้ตัวเลือกทั้งหมดมา รวมที่ปิดขาย/วัตถุดิบหมดด้วย (ไว้ใช้ในหน้าจัดการ)
 * ตอนรับออเดอร์ต้องกรองเหลือแค่ที่สั่งได้จริง ให้ตรงกับเมนูฝั่งลูกค้า
 */
const orderableGroups = (item: MenuItem): MenuOptionGroup[] =>
  item.optionGroups
    .map((group) => ({
      ...group,
      options: group.options.filter(
        (o) => o.isAvailable && !o.ingredientOutOfStock,
      ),
    }))
    .filter((group) => group.options.length > 0)

/**
 * ตัวเลือกที่เลือกไว้และยังสั่งได้อยู่ — ระหว่างรับออเดอร์ วัตถุดิบอาจหมด (menu.updated)
 * ถ้าส่งตัวเลือกที่หมดไปแล้ว backend จะปฏิเสธทั้งออเดอร์
 */
const selectedOptionIds = (line: DraftLine, item: MenuItem) => {
  const orderable = new Set(
    orderableGroups(item).flatMap((g) => g.options.map((o) => o.id)),
  )
  return [...Object.values(line.single), ...line.multi].filter((id) =>
    orderable.has(id),
  )
}

/**
 * พนักงานรับออเดอร์แทนลูกค้า — สำหรับลูกค้าที่ไม่ได้สแกน QR
 * กด "+ เพิ่ม" ที่เมนู → ได้บรรทัดใหม่ด้านล่าง เลือกตัวเลือก/จำนวน/หมายเหตุแยกรายบรรทัด
 */
export function TakeOrderDialog({
  session,
  onClose,
}: Readonly<{
  session: TableSession
  onClose: () => void
}>) {
  const { data: items, isPending } = useMenuItems()
  const createOrder = useCreateOrder()
  // isPending ยังไม่ทันเป็น true ตอนกดครั้งที่สอง — ล็อกแบบ sync กันออเดอร์ซ้ำ
  const sending = useRef(false)

  const [lines, setLines] = useState<DraftLine[]>([])
  const [nextKey, setNextKey] = useState(1)
  const [search, setSearch] = useState('')

  const itemById = useMemo(
    () => new Map((items ?? []).map((item) => [item.id, item])),
    [items],
  )

  const available = useMemo(() => {
    const keyword = search.trim().toLowerCase()
    return (items ?? [])
      .filter((i) => i.isAvailable && i.ingredientsOutOfStock.length === 0)
      .filter((i) => !keyword || i.name.toLowerCase().includes(keyword))
  }, [items, search])

  const addLine = (menuItemId: Id) => {
    setLines((prev) => [
      ...prev,
      { key: nextKey, menuItemId, quantity: 1, note: '', single: {}, multi: [] },
    ])
    setNextKey((k) => k + 1)
  }

  const updateLine = (key: number, patch: Partial<DraftLine>) =>
    setLines((prev) =>
      prev.map((line) => (line.key === key ? { ...line, ...patch } : line)),
    )

  /** กดชิปตัวเลือก — กลุ่มเลือกอันเดียวแทนที่ตัวเดิม, กลุ่มเลือกหลายอันสลับติ๊ก/เอาออก */
  const pickOption = (line: DraftLine, group: MenuOptionGroup, optionId: Id, checked: boolean) => {
    if (group.selectType === 'single') {
      updateLine(line.key, { single: { ...line.single, [group.id]: optionId } })
      return
    }
    updateLine(line.key, {
      multi: checked ? line.multi.filter((id) => id !== optionId) : [...line.multi, optionId],
    })
  }

  const removeLine = (key: number) =>
    setLines((prev) => prev.filter((line) => line.key !== key))

  /** ราคาต่อจาน = ราคาเมนู + ตัวเลือกที่เลือก (คิดจากตัวเลือกที่ยังสั่งได้เท่านั้น) */
  const unitPriceOf = (line: DraftLine) => {
    const item = itemById.get(line.menuItemId)
    if (!item) return 0
    const picked = new Set(selectedOptionIds(line, item))
    const optionTotal = orderableGroups(item)
      .flatMap((g) => g.options)
      .filter((o) => picked.has(o.id))
      .reduce((sum, o) => sum + o.price, 0)
    return item.price + optionTotal
  }

  /** บรรทัดที่ยังไม่ได้เลือกกลุ่มบังคับ (เนื้อสัตว์) — ส่งเข้าครัวไม่ได้ */
  const missingRequired = (line: DraftLine) => {
    const item = itemById.get(line.menuItemId)
    if (!item) return []
    // เช็คว่าตัวที่เลือกยังอยู่ในกลุ่มด้วย ไม่ใช่แค่เคยเลือก — ถ้าหมดไประหว่างนี้ต้องเลือกใหม่
    return orderableGroups(item).filter(
      (g) =>
        g.required &&
        g.selectType === 'single' &&
        !g.options.some((o) => o.id === line.single[g.id]),
    )
  }

  const total = lines.reduce(
    (sum, line) => sum + unitPriceOf(line) * line.quantity,
    0,
  )
  const count = lines.reduce((n, l) => n + l.quantity, 0)
  const incomplete = lines.some((line) => missingRequired(line).length > 0)

  const submit = () => {
    if (sending.current) return
    sending.current = true
    createOrder.mutate(
      {
        tableId: session.tableId,
        // ถ้าระหว่างที่เปิด dialog อีกเครื่องปิดบิลโต๊ะนี้ไปแล้ว backend จะปฏิเสธ แทนที่จะสร้างออเดอร์ลอย
        tableSessionId: session.id,
        lines: lines.flatMap((line) => {
          const item = itemById.get(line.menuItemId)
          if (!item) return []
          return [
            {
              menuItemId: line.menuItemId,
              quantity: line.quantity,
              note: line.note,
              optionIds: selectedOptionIds(line, item),
            },
          ]
        }),
      },
      {
        onSuccess: onClose,
        onSettled: () => {
          sending.current = false
        },
      },
    )
  }

  return (
    <Modal title={`รับออเดอร์ — โต๊ะ ${session.tableName}`} onClose={onClose}>
      <ErrorNote error={createOrder.error} />

      <input
        type="search"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="ค้นหาเมนู"
        className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-brand-300"
      />

      {isPending && <p className="mt-3 text-sm text-gray-500">กำลังโหลด...</p>}

      <ul className="mt-3 max-h-48 space-y-2 overflow-y-auto pr-1">
        {available.map((item) => (
          <li
            key={item.id}
            className="flex items-center justify-between gap-3 rounded-lg border border-gray-200 px-3 py-2"
          >
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-text">
                {item.name}
              </p>
              <p className="text-sm text-amount">{formatBaht(item.price)}</p>
            </div>
            <button
              type="button"
              onClick={() => addLine(item.id)}
              className="shrink-0 rounded-lg bg-brand-300 px-3 py-1.5 text-xs font-bold text-white transition hover:bg-brand-400"
            >
              + เพิ่ม
            </button>
          </li>
        ))}

        {!isPending && available.length === 0 && (
          <li className="py-6 text-center text-sm text-gray-400">
            ไม่พบเมนูที่ค้นหา
          </li>
        )}
      </ul>

      {lines.length > 0 && (
        <ul className="mt-4 max-h-72 space-y-2 overflow-y-auto border-t border-gray-200 pt-3 pr-1">
          {lines.map((line) => {
            const item = itemById.get(line.menuItemId)
            if (!item) return null
            const missing = missingRequired(line)

            return (
              <li
                key={line.key}
                className={`rounded-lg border px-3 py-2 ${
                  missing.length > 0
                    ? 'border-danger/50 bg-danger/5'
                    : 'border-brand-300 bg-brand-50/40'
                }`}
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-text">
                      {item.name}
                    </p>
                    <p className="text-sm text-amount">
                      {formatBaht(unitPriceOf(line))}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <QuantityStepper
                      size="sm"
                      min={1}
                      value={line.quantity}
                      onChange={(next) =>
                        updateLine(line.key, { quantity: Math.max(1, next) })
                      }
                    />
                    <button
                      type="button"
                      onClick={() => removeLine(line.key)}
                      aria-label={`ลบ ${item.name}`}
                      className="text-sm font-semibold text-danger"
                    >
                      ลบ
                    </button>
                  </div>
                </div>

                {orderableGroups(item).map((group) => (
                  <div key={group.id} className="mt-2">
                    <p className="text-xs font-semibold text-gray-600">
                      {group.name}
                      {group.required && <span className="ml-1 text-danger">*</span>}
                    </p>
                    <div className="mt-1 flex flex-wrap gap-1.5">
                      {group.options.map((option) => {
                        const checked =
                          group.selectType === 'single'
                            ? line.single[group.id] === option.id
                            : line.multi.includes(option.id)
                        return (
                          <button
                            key={option.id}
                            type="button"
                            aria-pressed={checked}
                            onClick={() => pickOption(line, group, option.id, checked)}
                            className={`rounded-full border px-2.5 py-1 text-xs transition ${
                              checked
                                ? 'border-brand-300 bg-brand-300 font-bold text-white'
                                : 'border-gray-300 bg-white text-gray-700 hover:border-brand-300'
                            }`}
                          >
                            {option.name}
                            {option.price > 0 && ` +${option.price}`}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                ))}

                <input
                  value={line.note}
                  onChange={(e) => updateLine(line.key, { note: e.target.value })}
                  maxLength={200}
                  placeholder={`หมายเหตุของ ${item.name} เช่น ไม่เผ็ด`}
                  className="mt-2 w-full rounded-lg border border-gray-300 px-3 py-1.5 text-sm outline-none focus:border-brand-300"
                />

                {missing.length > 0 && (
                  <p className="mt-1 text-xs font-semibold text-danger">
                    เลือก{missing.map((g) => g.name).join(', ')}ก่อน
                  </p>
                )}
              </li>
            )
          })}
        </ul>
      )}

      <div className="mt-4 flex items-center justify-between rounded-lg bg-brand-50 px-4 py-3">
        <span className="text-sm font-semibold text-gray-700">
          {count} รายการ
        </span>
        <span className="text-lg font-bold text-amount">
          {formatBaht(total)}
        </span>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3">
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg border-2 border-gray-300 py-2.5 text-sm font-bold text-gray-700 transition hover:bg-gray-50"
        >
          ยกเลิก
        </button>
        <button
          type="button"
          disabled={createOrder.isPending || count === 0 || incomplete}
          onClick={submit}
          className="rounded-lg bg-brand-300 py-2.5 text-sm font-bold text-white transition hover:bg-brand-400 disabled:bg-gray-300"
        >
          {createOrder.isPending ? 'กำลังส่ง...' : 'ส่งเข้าครัว'}
        </button>
      </div>
    </Modal>
  )
}
