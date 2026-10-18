/** แถบแจ้งเตือนเมื่อ mutation ล้มเหลว — เดิมกดปุ่มแล้ว fail เงียบ ผู้ใช้ไม่รู้ตัว */
export function ErrorNote({ error }: { error: unknown }) {
  if (!error) return null

  return (
    <p
      role="alert"
      className="mb-4 rounded-lg border border-danger/40 bg-danger/10 px-4 py-2.5 text-sm font-semibold text-danger"
    >
      {error instanceof Error ? error.message : 'เกิดข้อผิดพลาด ลองใหม่อีกครั้ง'}
    </p>
  )
}
