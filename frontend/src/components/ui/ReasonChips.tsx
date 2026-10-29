import { hasNoteTag, toggleNoteTag } from '@/lib/item-note'

/**
 * ปุ่มลัดเหตุผลใต้ช่องเหตุผล (ยืนยันสลิปเอง / ยกเลิกบิล) — แตะแทนการพิมพ์ตอนรีบ
 * เดิมพิมพ์เองล้วน ๆ เลยได้เหตุผลอย่าง "ำ" หรือ "e" ที่เจ้าของร้านย้อนดูแล้วไม่รู้เรื่อง
 * เลือกได้หลายข้อ กดซ้ำ = เอาออก ข้อความที่พิมพ์เพิ่มเองยังอยู่ครบ (ใช้ตัวคั่นเดียวกับโน้ตอาหาร)
 *
 * หน้าตาต้องเป็น "ปุ่ม" ไม่ใช่ "ช่อง" — พื้นขาวมีขอบเส้นเดียวอยู่ใต้ช่องกรอก ดูเหมือนช่องพิมพ์อีกช่อง
 * จึงใช้พื้นทึบไม่มีเส้นขอบ + ไอคอน + (ยังไม่เลือก) / ✓ (เลือกแล้ว) ไม่ได้บอกด้วยสีอย่างเดียว
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
            className={`inline-flex min-h-11 items-center gap-1.5 rounded-full px-3.5 text-sm font-semibold select-none transition ${
              on ? 'bg-brand-500 text-white hover:brightness-95' : 'bg-gray-100 text-gray-800 hover:bg-gray-200'
            }`}
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.75"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden
              className="h-4 w-4 shrink-0"
            >
              {on ? <path d="m5 12.5 4.5 4.5L19 7.5" /> : <path d="M12 5v14M5 12h14" />}
            </svg>
            {preset}
          </button>
        )
      })}
    </div>
  )
}
