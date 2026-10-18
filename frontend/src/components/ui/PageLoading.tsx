/** แสดงระหว่างรอโหลด chunk ของหน้านั้น ๆ (code splitting ที่ routes.tsx) */
export function PageLoading() {
  return (
    <div className="flex min-h-60 items-center justify-center py-16">
      <div className="flex items-center gap-3 text-brand-400">
        <span className="h-5 w-5 animate-spin rounded-full border-2 border-brand-100 border-t-brand-400" />
        <span className="text-sm font-semibold">กำลังโหลด...</span>
      </div>
    </div>
  )
}
