export function SearchInput({
  value,
  onChange,
  placeholder = 'ค้นหา',
  label,
}: {
  value: string
  onChange: (next: string) => void
  placeholder?: string
  /** ข้อความสำหรับ screen reader — ไม่ระบุจะใช้ placeholder */
  label?: string
}) {
  return (
    <label className="relative block">
      <span className="sr-only">{label ?? placeholder}</span>

      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        aria-hidden
        className="pointer-events-none absolute top-1/2 left-4 h-5 w-5 -translate-y-1/2 text-field-text md:h-6 md:w-6"
      >
        <circle cx="11" cy="11" r="7" />
        <path d="m20 20-3.5-3.5" strokeLinecap="round" />
      </svg>

      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-xl border border-brand-500 bg-field py-3 pr-4 pl-12 text-sm font-bold text-field-text shadow-md outline-none placeholder:font-bold placeholder:text-field-text focus:border-brand-300 md:py-4 md:pl-14 md:text-base"
      />
    </label>
  )
}
