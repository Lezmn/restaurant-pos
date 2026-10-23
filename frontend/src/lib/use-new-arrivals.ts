import { useEffect, useRef } from 'react'

/**
 * เรียก onArrive เมื่อมี id ใหม่โผล่ในรายการ (ออเดอร์ใหม่ / คำขอเรียกพนักงานใหม่)
 * - โหลดครั้งแรกไม่นับ — เปิดจอมาแล้วมีของค้างอยู่ ไม่ต้องร้องทุกอัน
 * - id ที่หายไปแล้ว (ย้ายคอลัมน์/รับทราบแล้ว) ไม่นับ และกลับมาอีกก็ไม่ร้องซ้ำ
 * ids = undefined ระหว่างยังโหลดไม่เสร็จ
 */
export function useNewArrivals(ids: readonly string[] | undefined, onArrive: (count: number) => void) {
  const seen = useRef<Set<string> | null>(null)
  const callback = useRef(onArrive)
  useEffect(() => {
    callback.current = onArrive
  }, [onArrive])

  // เทียบด้วยข้อความ ไม่ใช่ array — query refetch ได้ array ใหม่ทุกรอบแม้ข้อมูลเดิม
  const key = ids?.join(',')
  useEffect(() => {
    if (key === undefined) return
    const current = key ? key.split(',') : []
    if (seen.current === null) {
      seen.current = new Set(current)
      return
    }
    const fresh = current.filter((id) => !seen.current!.has(id))
    for (const id of fresh) seen.current.add(id)
    if (fresh.length > 0) callback.current(fresh.length)
  }, [key])
}
