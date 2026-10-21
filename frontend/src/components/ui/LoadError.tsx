import { isRateLimited } from '@/lib/api-client'
import { button } from './styles'

/**
 * แถบแจ้งว่าดึงข้อมูลไม่ได้ — ห้ามปล่อยให้หน้าแสดง "ไม่มีข้อมูล" แทน
 * เดิม API ล่มแล้วหน้า Check ขึ้น "ยังไม่มีโต๊ะที่เปิดอยู่" แคชเชียร์เข้าใจว่าไม่มีโต๊ะค้างจ่าย
 */
export function LoadError({
  what,
  stale = false,
  error,
  onRetry,
}: {
  /** สิ่งที่โหลดไม่ขึ้น เช่น "รายการโต๊ะ" */
  what: string
  /** ยังมีข้อมูลรอบก่อนแสดงอยู่ — บอกให้รู้ว่าอาจไม่ใช่ล่าสุด */
  stale?: boolean
  /** error ของ query — 429 บอกให้รอ แทนที่จะบอกให้ตรวจเน็ต */
  error?: unknown
  onRetry: () => void
}) {
  const rateLimited = isRateLimited(error)
  return (
    <div
      role="alert"
      className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-danger/40 bg-danger/5 px-4 py-3"
    >
      <p className="text-sm font-semibold text-danger-ink">
        โหลด{what}ไม่ได้
        <span className="block font-normal text-gray-700">
          {rateLimited
            ? 'มีคำขอถี่เกินไป ระบบพักรับคำขอชั่วคราว — รอสักครู่ (ไม่เกิน 1 นาที) แล้วจะโหลดใหม่เอง'
            : stale
              ? 'ข้อมูลที่เห็นอยู่อาจไม่ใช่ล่าสุด ตรวจการเชื่อมต่อแล้วลองใหม่'
              : 'ตรวจการเชื่อมต่ออินเทอร์เน็ตหรือเซิร์ฟเวอร์ แล้วลองใหม่'}
        </span>
      </p>
      <button type="button" onClick={onRetry} className={button('danger-outline', 'sm')}>
        ลองใหม่
      </button>
    </div>
  )
}
