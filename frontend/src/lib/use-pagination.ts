import { useMemo, useState } from 'react'

/** จำนวนแถวต่อหน้าที่ใช้เหมือนกันทุกตาราง — เกินนี้แล้วเริ่มรก */
export const PAGE_SIZE = 10

/**
 * ตัดรายการเป็นหน้า ๆ ใช้ร่วมกันทั้งบิลที่เก็บแล้ว / การแจ้งเตือน / รายรับ-รายจ่าย
 *
 * clamp หน้าปัจจุบันไว้ด้วย เพราะรายการหดได้ตลอด (เปลี่ยนตัวกรอง, socket ส่งข้อมูลใหม่)
 * ถ้าไม่ clamp แล้วอยู่หน้า 3 พอเหลือ 5 แถวจะกลายเป็นหน้าว่าง
 */
export function usePagination<T>(items: T[], pageSize = PAGE_SIZE) {
  const [requestedPage, setPage] = useState(1)

  const totalPages = Math.max(1, Math.ceil(items.length / pageSize))
  const page = Math.min(requestedPage, totalPages)

  const pageItems = useMemo(
    () => items.slice((page - 1) * pageSize, page * pageSize),
    [items, page, pageSize],
  )

  return {
    page,
    setPage,
    totalPages,
    pageItems,
    total: items.length,
    /** ลำดับแถวแรก-แถวสุดท้ายของหน้านี้ (นับจาก 1) ไว้โชว์ว่า "1–10 จาก 24" */
    from: items.length === 0 ? 0 : (page - 1) * pageSize + 1,
    to: Math.min(page * pageSize, items.length),
  }
}
