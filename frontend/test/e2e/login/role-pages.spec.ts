import { test, expect, type Page } from '@playwright/test'
import { loginAsKitchen, loginAsStaff } from '../helpers'

// ⚠️ ต้องรัน backend จริง + seed data
// สิทธิ์เข้าหน้าตาม role (src/features/auth/permissions.ts) — หน้าที่ไม่มีสิทธิ์ต้องเด้งกลับหน้าแรกของ role นั้น
// ไม่ใช่โชว์หน้าแล้วเจอ 403 จาก API · ตัวกันจริงคือ backend (ดู test/e2e/api/authz.spec.ts)
// ADMIN เข้าได้ทุกหน้า (test/e2e/admin/access.spec.ts)

const ownerPages = ['/owner/dashboard', '/owner/finance', '/owner/sales', '/owner/cash-closes', '/owner/users', '/owner/audit', '/owner/line']

/** เปิดทีละหน้า แล้วเช็กว่าอยู่หน้าเดิม (allowed) หรือถูกพาไปหน้าแรกของ role (denied) */
async function expectPages(page: Page, paths: string[], landing: RegExp | null) {
  for (const path of paths) {
    await page.goto(path)
    await expect(page, path).toHaveURL(landing ?? new RegExp(`${path}$`))
  }
}

// ทดสอบ: STAFF (แคชเชียร์) เข้าหน้าหน้าร้านได้ครบ แต่จอครัว หน้าจัดการเมนู และหน้าเจ้าของร้านทุกหน้า ต้องเด้งกลับ /employee/check
// วิธี: login เป็น staff → เปิด check/tables/takeaway/orders/requests เช็กว่า URL ไม่เปลี่ยน → เปิด /employee/order, /employee/manage และ /owner/* ทีละหน้า เช็กว่าถูกพาไป /employee/check
test('STAFF: เข้าหน้าหน้าร้านได้ · จอครัว/จัดการเมนู/หน้าเจ้าของร้าน เด้งกลับ /employee/check', async ({ page, request }) => {
  await loginAsStaff(page, request)
  await expectPages(
    page,
    ['/employee/check', '/employee/tables', '/employee/takeaway', '/employee/orders', '/employee/requests'],
    null,
  )
  await expectPages(page, ['/employee/order', '/employee/manage', ...ownerPages], /\/employee\/check$/)
})

// ทดสอบ: KITCHEN เข้าได้แค่จอครัวกับหน้าจัดการเมนู (เปิด/ปิดขาย) — หน้าเก็บเงิน เปิดโต๊ะ กลับบ้าน รายการออเดอร์ คำขอลูกค้า และหน้าเจ้าของร้าน ต้องเด้งกลับ /employee/order
// วิธี: login เป็น kitchen → เปิด /employee/order, /employee/manage เช็กว่า URL ไม่เปลี่ยน → เปิดหน้าที่ไม่มีสิทธิ์ทีละหน้า เช็กว่าถูกพาไป /employee/order
test('KITCHEN: เข้าจอครัว/จัดการเมนูได้ · หน้าแคชเชียร์และเจ้าของร้าน เด้งกลับ /employee/order', async ({ page, request }) => {
  await loginAsKitchen(page, request)
  await expectPages(page, ['/employee/order', '/employee/manage'], null)
  await expectPages(
    page,
    ['/employee/check', '/employee/tables', '/employee/takeaway', '/employee/orders', '/employee/requests', ...ownerPages],
    /\/employee\/order$/,
  )
})

// ทดสอบ: คนที่ยังไม่ login (เช่น ลูกค้าที่สแกน QR แล้วลองพิมพ์ลิงก์หน้าพนักงานเอง) เข้าหน้าพนักงาน/เจ้าของร้านไม่ได้ ต้องไปหน้า login
// วิธี: ไม่ login → เปิดหน้าพนักงานและหน้าเจ้าของร้านหลายหน้า → เช็กว่าทุกหน้าพาไป /login
test('ยังไม่ login (ลูกค้า QR): หน้าพนักงาน/เจ้าของร้านทุกหน้า พาไป /login', async ({ page }) => {
  await expectPages(
    page,
    ['/employee/order', '/employee/check', '/employee/takeaway', '/employee/manage', '/owner/finance', '/owner/line'],
    /\/login$/,
  )
})
