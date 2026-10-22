/**
 * สวิตช์เปิด/ปิด (เมนู, วัตถุดิบ) — ปุ่มจริงใหญ่ 44×56 สำหรับนิ้วบนแท็บเล็ต ตัวสวิตช์ที่เห็นอยู่ข้างใน
 * `busy` = กำลังบันทึกตัวนี้อยู่ ล็อกเฉพาะตัวนี้ ตัวอื่นยังกดต่อได้
 */
export function Switch({
  checked,
  label,
  busy = false,
  onChange,
}: Readonly<{
  checked: boolean
  label: string
  busy?: boolean
  onChange: (next: boolean) => void
}>) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      aria-busy={busy}
      disabled={busy}
      onClick={() => onChange(!checked)}
      className="flex h-11 w-14 shrink-0 items-center justify-center rounded-full disabled:cursor-wait disabled:opacity-60"
    >
      <span
        className={`relative block h-7 w-12 rounded-full transition ${
          checked ? 'bg-brand-500' : 'bg-gray-400'
        }`}
      >
        <span
          className={`absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition-all ${
            checked ? 'left-[22px]' : 'left-0.5'
          }`}
        />
      </span>
    </button>
  )
}
