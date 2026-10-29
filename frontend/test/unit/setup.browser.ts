import { afterEach } from 'vitest'

// ใช้เฉพาะ npm run test:browser — ค้างหน้าจอของแต่ละเทสต์ไว้ก่อนล้างทิ้ง จะได้ดูทัน
// ตั้งได้ด้วย VITEST_SLOWMO (ms) ค่าเริ่มต้น 500 / 0 = ไม่หน่วง
// ลงทะเบียนหลัง setup.ts → afterEach ตัวนี้รันก่อน cleanup() ของ setup.ts (vitest รัน after hook แบบ stack)
const pause = Number(import.meta.env.VITEST_SLOWMO ?? 500)

if (pause > 0) {
  afterEach(async () => {
    await new Promise((resolve) => setTimeout(resolve, pause))
  })
}
