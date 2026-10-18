/** แถบเปลี่ยนหน้า — ซ่อนตัวเองถ้ามีหน้าเดียว จะได้ไม่เกะกะตอนรายการยังน้อย */
export function Pagination({
  page,
  totalPages,
  from,
  to,
  total,
  onChange,
  unit = 'รายการ',
}: {
  page: number
  totalPages: number
  from: number
  to: number
  total: number
  onChange: (page: number) => void
  /** หน่วยที่จะแสดงต่อท้ายจำนวน เช่น "บิล" */
  unit?: string
}) {
  if (totalPages <= 1) return null

  return (
    <nav
      aria-label="แบ่งหน้า"
      className="mt-3 flex flex-wrap items-center justify-between gap-3"
    >
      <p className="text-sm text-gray-500">
        {from}–{to} จาก {total} {unit}
      </p>

      <div className="flex items-center gap-1">
        <PageButton
          label="ก่อนหน้า"
          disabled={page === 1}
          onClick={() => onChange(page - 1)}
        />

        {pageNumbers(page, totalPages).map((n, i) =>
          n === null ? (
            <span key={`gap-${i}`} className="px-1 text-sm text-gray-400">
              …
            </span>
          ) : (
            <button
              key={n}
              type="button"
              aria-current={n === page ? 'page' : undefined}
              onClick={() => onChange(n)}
              className={`min-w-9 rounded-lg px-3 py-1.5 text-sm font-bold transition ${
                n === page
                  ? 'bg-brand-400 text-white'
                  : 'text-gray-600 hover:bg-brand-50 hover:text-brand-400'
              }`}
            >
              {n}
            </button>
          ),
        )}

        <PageButton
          label="ถัดไป"
          disabled={page === totalPages}
          onClick={() => onChange(page + 1)}
        />
      </div>
    </nav>
  )
}

function PageButton({
  label,
  disabled,
  onClick,
}: {
  label: string
  disabled: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="rounded-lg px-3 py-1.5 text-sm font-semibold text-gray-600 transition hover:bg-brand-50 hover:text-brand-400 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-gray-600"
    >
      {label}
    </button>
  )
}

/**
 * เลขหน้าที่จะโชว์ — หน้าแรก หน้าสุดท้าย และรอบ ๆ หน้าปัจจุบัน
 * null = จุดไข่ปลา กันแถวยาวเป็นพรืดตอนมีหลายสิบหน้า
 */
function pageNumbers(page: number, totalPages: number): (number | null)[] {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, i) => i + 1)
  }

  const pages = new Set([1, totalPages, page, page - 1, page + 1])
  const visible = [...pages]
    .filter((n) => n >= 1 && n <= totalPages)
    .sort((a, b) => a - b)

  return visible.flatMap((n, i) =>
    i > 0 && n - visible[i - 1] > 1 ? [null, n] : [n],
  )
}
