import { hasNoteTag, toggleNoteTag } from '@/lib/item-note'

/**
 * ปุ่มลัดเหตุผลเหนือช่องเหตุผล (ยืนยันสลิปเอง / ยกเลิกบิล) — แตะแทนการพิมพ์ตอนรีบ
 * เดิมพิมพ์เองล้วน ๆ เลยได้เหตุผลอย่าง "ำ" หรือ "e" ที่เจ้าของร้านย้อนดูแล้วไม่รู้เรื่อง
 * เลือกได้หลายข้อ กดซ้ำ = เอาออก ข้อความที่พิมพ์เพิ่มเองยังอยู่ครบ (ใช้ตัวคั่นเดียวกับโน้ตอาหาร)
 */
export function ReasonChips({
  presets,
  value,
  onChange,
  label,
  maxLength = 200,
}: Readonly<{
  presets: readonly string[]
  value: string
  onChange: (next: string) => void
  /** ชื่อกลุ่มให้ screen reader */
  label: string
  maxLength?: number
}>) {
  return (
    <div className="mt-2 flex flex-wrap gap-1.5" role="group" aria-label={label}>
      {presets.map((preset) => {
        const on = hasNoteTag(value, preset)
        return (
          <button
            key={preset}
            type="button"
            aria-pressed={on}
            onClick={() => onChange(toggleNoteTag(value, preset, maxLength))}
            className={`min-h-11 rounded-full border px-3 text-sm font-semibold transition ${
              on
                ? 'border-brand-500 bg-brand-500 text-white'
                : 'border-gray-300 bg-white text-gray-700 hover:border-brand-400'
            }`}
          >
            {preset}
          </button>
        )
      })}
    </div>
  )
}
