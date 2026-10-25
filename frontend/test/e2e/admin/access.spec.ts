import { test, expect } from '@playwright/test'
import { loginAsAdmin, loginAsStaff } from '../helpers'

// ⚠️ ต้องรัน backend จริง + seed data ที่ localhost:3000 (ทุกไฟล์ในโฟลเดอร์ test/e2e/admin)
// ADMIN มีสิทธิ์เข้าทุกหน้าของพนักงาน (ดู pageRoles ใน src/features/auth/permissions.ts)

const everyEmployeePage = [
  '/employee/order',
  '/employee/check',
  '/employee/manage',
  '/employee/tables',
  '/employee/orders',
  '/employee/requests',
  '/employee/users',
]

for (const path of everyEmployeePage) {
  // ทดสอบ: ADMIN เปิดหน้าพนักงานได้ทุกหน้า ไม่ถูกพาไปหน้าอื่น
  // วิธี: วน login เป็น admin แล้วเปิดหน้าพนักงานทั้ง 7 หน้าทีละหน้า → เช็กว่า URL ยังเป็นหน้าที่เปิด
  test(`admin เข้าหน้า ${path} ได้โดยไม่ถูกเด้งออก`, async ({ page, request }) => {
    await loginAsAdmin(page, request)
    await page.goto(path)

    await expect(page).toHaveURL(new RegExp(`${path}$`))
  })
}

// ทดสอบ: ADMIN เปิดหน้าเจ้าของร้าน (Dashboard และการเงิน) ได้
// วิธี: login เป็น admin → เปิด /owner/dashboard และ /owner/finance → เช็กว่า URL ไม่เปลี่ยน
test('admin เข้าหน้า owner dashboard และ finance ได้ (backend ไม่มี role OWNER แยก ใช้ ADMIN แทน)', async ({
  page,
  request,
}) => {
  await loginAsAdmin(page, request)

  await page.goto('/owner/dashboard')
  await expect(page).toHaveURL(/\/owner\/dashboard$/)

  await page.goto('/owner/finance')
  await expect(page).toHaveURL(/\/owner\/finance$/)
})

// เทียบกับ role อื่น เพื่อพิสูจน์ว่าหน้าที่ ADMIN เท่านั้นเข้าได้ กัน role อื่นออกจริง ไม่ใช่แค่ ADMIN เข้าได้เฉย ๆ
//
// fallbackPath ของ ProtectedRoute คือ /employee ก็จริง แต่ /employee เองก็แค่ EmployeeHome
// ที่ redirect ต่อทันทีตาม homeByRole (STAFF -> /employee/check) เลยต้องเช็คปลายทางสุดท้ายนี้แทน
// หน้าเจ้าของร้าน: ProtectedRoute ใช้ fallbackPath="/employee" (ไม่มี /owner/login แยกแล้ว)
for (const { name, path } of [
  { name: 'manage (ADMIN เท่านั้น)', path: '/employee/manage' },
  { name: 'users (ADMIN เท่านั้น)', path: '/employee/users' },
  { name: 'owner', path: '/owner/dashboard' },
]) {
  // ทดสอบ: STAFF เปิดหน้าที่ให้แค่ ADMIN ใช้ (จัดการเมนู, บัญชีผู้ใช้, เจ้าของร้าน) ไม่ได้
  // วิธี: วน login เป็น staff แล้วเปิดแต่ละหน้าตรง ๆ → เช็กว่าถูกพากลับ /employee/check
  test(`STAFF เข้าหน้า ${name} ไม่ได้ ต้องถูกเด้งกลับหน้าแรกของ STAFF (/employee/check)`, async ({
    page,
    request,
  }) => {
    await loginAsStaff(page, request)
    await page.goto(path)

    await expect(page).toHaveURL(/\/employee\/check$/)
  })
}
