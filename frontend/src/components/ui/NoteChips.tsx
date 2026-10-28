import { NOTE_PRESETS, hasNoteTag, toggleNoteTag } from '@/lib/item-note'

/**
 * ปุ่มลัดเหนือช่องหมายเหตุ — ระดับความเผ็ด (เลือกได้อย่างเดียว) กดซ้ำ = เอาออก
 * เรื่องอื่นพิมพ์ในช่องหมายเหตุเอง
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
  const pad = size === 'sm' ? 'min-h-10 px-2.5 text-xs' : 'min-h-11 px-3 text-sm'

  const chip = (tag: string) => {
    const on = hasNoteTag(value, tag)
    const tone = on
      ? 'border-brand-500 bg-brand-500 text-white'
      : 'border-gray-300 bg-white text-gray-700 hover:border-brand-400'
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
    <div className="flex flex-wrap gap-1.5" role="group" aria-label="ระดับความเผ็ด">
      {NOTE_PRESETS.map((tag) => chip(tag))}
    </div>
  )
}
