import { test, expect } from '@playwright/test'
import { loginAsAdmin, loginAsStaff } from '../helpers'

// ⚠️ ต้องรัน backend จริง + seed data ที่ localhost:3000 (ทุกไฟล์ในโฟลเดอร์ test/admin)
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
  test(`admin เข้าหน้า ${path} ได้โดยไม่ถูกเด้งออก`, async ({ page, request }) => {
    await loginAsAdmin(page, request)
    await page.goto(path)

    await expect(page).toHaveURL(new RegExp(`${path}$`))
  })
}

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
test('STAFF เข้าหน้า manage (ADMIN เท่านั้น) ไม่ได้ ต้องถูกเด้งกลับหน้าแรกของ STAFF (/employee/check)', async ({
  page,
  request,
}) => {
  await loginAsStaff(page, request)
  await page.goto('/employee/manage')

  await expect(page).toHaveURL(/\/employee\/check$/)
})

test('STAFF เข้าหน้า users (ADMIN เท่านั้น) ไม่ได้ ต้องถูกเด้งกลับหน้าแรกของ STAFF (/employee/check)', async ({
  page,
  request,
}) => {
  await loginAsStaff(page, request)
  await page.goto('/employee/users')

  await expect(page).toHaveURL(/\/employee\/check$/)
})

// หน้าเจ้าของร้าน: ProtectedRoute ใช้ fallbackPath="/employee" (ไม่มี /owner/login แยกแล้ว)
test('STAFF เข้าหน้า owner ไม่ได้ ต้องถูกเด้งกลับหน้าแรกของ STAFF (/employee/check)', async ({
  page,
  request,
}) => {
  await loginAsStaff(page, request)
  await page.goto('/owner/dashboard')

  await expect(page).toHaveURL(/\/employee\/check$/)
})
