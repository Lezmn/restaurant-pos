import { ALLERGY_PRESETS, NOTE_PRESETS, hasNoteTag, toggleNoteTag } from '@/lib/item-note'

/**
 * ปุ่มลัดเหนือช่องหมายเหตุ — กดแล้วเติม/เอาคำออกจากโน้ต ไม่ต้องพิมพ์บนมือถือ
 * ปุ่มแพ้อาหารสีแดง แยกจากปุ่มรสชาติ ให้รู้ว่าเป็นเรื่องที่ครัวต้องระวังจริง
 */
export function NoteChips({
  value,
  onChange,
  maxLength = 200,
  size = 'md',
}: Readonly<{
  value: string
  onChange: (next: string) => void
  maxLength?: number
  size?: 'sm' | 'md'
}>) {
  const pad = size === 'sm' ? 'min-h-8 px-2.5 text-xs' : 'min-h-9 px-3 text-sm'

  const chip = (tag: string, allergy: boolean) => {
    const on = hasNoteTag(value, tag)
    const tone = allergy
      ? on
        ? 'border-danger-ink bg-danger-ink text-white'
        : 'border-danger/40 bg-white text-danger-ink hover:border-danger-ink'
      : on
        ? 'border-brand-300 bg-brand-300 text-white'
        : 'border-gray-300 bg-white text-gray-700 hover:border-brand-300'
    return (
      <button
        key={tag}
        type="button"
        aria-pressed={on}
        onClick={() => onChange(toggleNoteTag(value, tag, maxLength))}
        className={`rounded-full border font-semibold transition ${pad} ${tone}`}
      >
        {tag}
      </button>
    )
  }

  return (
    <div className="flex flex-wrap gap-1.5" role="group" aria-label="หมายเหตุที่ใช้บ่อย">
      {NOTE_PRESETS.map((tag) => chip(tag, false))}
      {ALLERGY_PRESETS.map((tag) => chip(tag, true))}
    </div>
  )
}
