import { useEffect, type RefObject } from 'react'

/**
 * กด "/" ที่ไหนก็ได้ในหน้า → โฟกัสช่องค้นหา (แบบ GitHub / Gmail) สำหรับคนที่ใช้คีย์บอร์ดคู่กับแท็บเล็ต
 * ไม่ทำงานตอนกำลังพิมพ์อยู่ในช่องอื่น หรือมีกล่อง (dialog) เปิดอยู่
 */
export function useSlashFocus(ref: RefObject<HTMLInputElement | null>) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== '/' || e.ctrlKey || e.metaKey || e.altKey) return
      const target = e.target as HTMLElement | null
      if (target?.closest('input, textarea, select, [contenteditable="true"]')) return
      if (document.querySelector('dialog[open]')) return
      if (!ref.current) return
      e.preventDefault()
      ref.current.focus()
      ref.current.select()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [ref])
}
