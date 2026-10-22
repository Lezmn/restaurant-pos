const AUTO_PRINT_KEY = 'restaurant.autoPrintReceipt'

/**
 * ค่าตั้งการพิมพ์ "ของเครื่องนี้" — เก็บใน localStorage เพราะขึ้นกับว่าเครื่องไหนต่อเครื่องพิมพ์ใบเสร็จ
 * (เครื่องแคชเชียร์ที่เสียบ USB เปิด, แท็บเล็ตหน้าร้านปิด) ไม่ใช่ค่าของร้านทั้งร้าน
 * localStorage ใช้ไม่ได้ (โหมดส่วนตัว/ถูกบล็อก) → ถือว่าปิด ไม่ throw
 */
export const printSettings = {
  getAutoPrintReceipt(): boolean {
    try {
      return localStorage.getItem(AUTO_PRINT_KEY) === '1'
    } catch {
      return false
    }
  },
  setAutoPrintReceipt(on: boolean) {
    try {
      if (on) localStorage.setItem(AUTO_PRINT_KEY, '1')
      else localStorage.removeItem(AUTO_PRINT_KEY)
    } catch {
      // เก็บไม่ได้ก็แค่ไม่จำ — รอบนี้ยังใช้ค่าที่เลือกใน state ได้
    }
  },
}
