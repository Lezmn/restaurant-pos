/**
 * ดอกจันแดงต่อท้ายชื่อช่องที่ต้องกรอก — ใช้ทุกฟอร์มฝั่งพนักงาน/เจ้าของร้านให้หน้าตาเดียวกัน
 * ตาเห็น "*" ส่วน screen reader อ่านว่า "จำเป็น" แทน (อ่าน "ดอกจัน" ไม่สื่อ)
 */
export function RequiredMark() {
  return (
    <>
      <span aria-hidden className="ml-1 text-danger-ink">
        *
      </span>
      <span className="sr-only">(จำเป็น)</span>
    </>
  )
}
