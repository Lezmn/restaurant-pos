import { test, expect } from '@playwright/test'
import { submitLogin } from '../helpers'

// ⚠️ ต้องรัน backend จริง + seed data (prisma/seed.ts) ที่ localhost:3000
// รหัสผ่าน seed ทุกบัญชีคือ "ChangeMe123!"

test('login ด้วยบัญชี admin สำเร็จ ต้องถูกพาไปหน้า order (homeByRole ของ ADMIN)', async ({
  page,
}) => {
  await page.goto('/login')

  await submitLogin(page, 'admin', 'ChangeMe123!')

  // /employee -> EmployeeHome -> redirect ต่อตาม role (ADMIN, KITCHEN ไป /employee/order)
  await expect(page).toHaveURL(/\/employee\/order$/)
  console.log('login ด้วยบัญชี admin สำเร็จ ต้องถูกพาไปหน้า order (homeByRole ของ ADMIN) ✅')
})

test('login ด้วยบัญชี staff (STAFF) สำเร็จ ต้องถูกพาไปหน้า check', async ({ page }) => {
  await page.goto('/login')

  await submitLogin(page, 'staff', 'ChangeMe123!')

  // STAFF ไป /employee/check ตาม homeByRole
  await expect(page).toHaveURL(/\/employee\/check$/)
  console.log('login ด้วยบัญชี staff (STAFF) สำเร็จ ต้องถูกพาไปหน้า check ✅')
})

test('login ด้วยบัญชี kitchen (KITCHEN) สำเร็จ ต้องถูกพาไปหน้า kitchen', async ({
  page,
}) => {
  await page.goto('/login')

  await submitLogin(page, 'kitchen', 'ChangeMe123!')

  await expect(page).toHaveURL(/\/employee\/order$/)
  console.log('login ด้วยบัญชี kitchen (KITCHEN) สำเร็จ ต้องถูกพาไปหน้า order ✅')
})
