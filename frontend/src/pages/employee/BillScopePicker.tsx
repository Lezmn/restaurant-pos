import { QuantityStepper } from '@/components/ui/QuantityStepper'
import { fieldLabel } from '@/components/ui/styles'
import { formatBaht } from '@/lib/format'
import { MAX_SPLIT_PARTS, MIN_SPLIT_PARTS } from '@/lib/split'
import type { Id, SessionSplit } from '@/types/models'

/** เก็บเงินทั้งโต๊ะ / เฉพาะรายการที่เลือก / หารเท่ากันทีละคน */
export type BillScope = 'all' | 'items' | 'even'

/** รายการที่เสิร์ฟแล้วและยังไม่จ่ายของโต๊ะ — ให้เลือกว่าคนนี้จ่ายจานไหน */
export interface PayLine {
  id: Id
  name: string
  options: string[]
  quantity: number
  /** ราคาต่อ 1 จาน รวมตัวเลือกแล้ว */
  each: number
}

const scopeLabel: Record<BillScope, string> = {
  all: 'ทั้งโต๊ะ',
  items: 'เลือกรายการ',
  even: 'หารเท่ากัน',
}

export function BillScopePicker({
  scope,
  onScope,
  lines,
  picked,
  onPick,
  parts,
  onParts,
  split,
  share,
  lastShare,
}: Readonly<{
  scope: BillScope
  onScope: (next: BillScope) => void
  lines: PayLine[]
  picked: Record<Id, number>
  onPick: (id: Id, quantity: number) => void
  parts: number
  onParts: (next: number) => void
  /** โต๊ะนี้หารค้างอยู่ — ล็อกเป็นหารเท่ากัน เปลี่ยนจำนวนคนไม่ได้ */
  split: SessionSplit | null
  /** ส่วนของคนนี้ / ของคนสุดท้าย (หารเท่ากัน) */
  share: number
  lastShare: number
}>) {
  if (split) {
    return (
      <div className="mt-4 rounded-lg border-2 border-brand-200 bg-brand-50 px-4 py-3 text-sm">
        <p className="font-bold text-black">
          หาร {split.parts} คน · จ่ายแล้ว {split.paidParts} คน · นี่คือคนที่ {split.paidParts + 1}
        </p>
        <p className="mt-0.5 text-gray-700">
          ทั้งบิล {formatBaht(split.total)} · จ่ายแล้ว {formatBaht(split.paidAmount)} · ค้าง{' '}
          {formatBaht(split.remaining)}
        </p>
      </div>
    )
  }

  return (
    <div className="mt-4">
      <div role="group" aria-label="เก็บเงินแบบไหน" className="grid grid-cols-3 gap-2">
        {(Object.keys(scopeLabel) as BillScope[]).map((s) => (
          <button
            key={s}
            type="button"
            aria-pressed={scope === s}
            onClick={() => onScope(s)}
            className={`min-h-11 rounded-lg border-2 px-2 text-sm font-bold transition ${
              scope === s
                ? 'border-brand-400 bg-brand-50 text-brand-500'
                : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50'
            }`}
          >
            {scopeLabel[s]}
          </button>
        ))}
      </div>

      {scope === 'items' && (
        <fieldset className="mt-3">
          <legend className={fieldLabel}>คนนี้จ่ายรายการไหน</legend>
          <ul className="mt-2 max-h-64 divide-y divide-gray-200 overflow-y-auto rounded-lg border-2 border-gray-200">
            {lines.map((line) => {
              const qty = picked[line.id] ?? 0
              return (
                <li key={line.id} className="flex items-center justify-between gap-3 px-3 py-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-black">{line.name}</p>
                    <p className="truncate text-sm text-gray-600 tabular-nums">
                      {line.options.length > 0 && `${line.options.join(', ')} · `}
                      {formatBaht(line.each)} × {line.quantity}
                    </p>
                  </div>
                  <div role="group" aria-label={`จำนวน ${line.name} ที่จ่าย`} className="shrink-0">
                    <QuantityStepper
                      size="sm"
                      value={qty}
                      min={0}
                      max={line.quantity}
                      onChange={(next) => onPick(line.id, next)}
                    />
                  </div>
                </li>
              )
            })}
          </ul>
          {lines.length === 0 && (
            <p className="mt-2 text-sm text-gray-600">ไม่มีรายการที่เสิร์ฟแล้วให้เลือก</p>
          )}
        </fieldset>
      )}

      {scope === 'even' && (
        <div className="mt-3 flex items-center justify-between gap-3 rounded-lg border-2 border-gray-200 px-3 py-2">
          <div>
            <p className={fieldLabel}>หารกี่คน</p>
            <p className="text-sm text-gray-600 tabular-nums">
              คนละ {formatBaht(share)}
              {lastShare !== share && ` (คนสุดท้าย ${formatBaht(lastShare)})`}
            </p>
          </div>
          <div role="group" aria-label="จำนวนคนที่หาร">
            <QuantityStepper
              value={parts}
              min={MIN_SPLIT_PARTS}
              max={MAX_SPLIT_PARTS}
              onChange={onParts}
            />
          </div>
        </div>
      )}
    </div>
  )
}
