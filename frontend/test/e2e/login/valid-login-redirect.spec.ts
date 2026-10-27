import { test, expect } from '@playwright/test'
import { submitLogin } from '../helpers'

// ⚠️ ต้องรัน backend จริง + seed data (prisma/seed.ts) ที่ localhost:3000
// รหัสผ่าน seed ทุกบัญชีคือ "ChangeMe123!"

// ทดสอบ: admin (เจ้าของร้าน) login สำเร็จแล้วต้องไปหน้า /owner/dashboard
// วิธี: กรอก admin + รหัสจาก seed ในฟอร์มจริง → เช็ก URL
test('login ด้วยบัญชี admin สำเร็จ ต้องถูกพาไปหน้า owner dashboard', async ({
  page,
}) => {
  await page.goto('/login')

  await submitLogin(page, 'admin', 'ChangeMe123!')

  // ADMIN = เจ้าของร้าน ไปหน้า Dashboard ก่อน (STAFF/KITCHEN ยังไปหน้าพนักงานตาม homeByRole)
  await expect(page).toHaveURL(/\/owner\/dashboard$/)
})

// ทดสอบ: staff login สำเร็จแล้วต้องไปหน้า /employee/check
// วิธี: กรอก staff + รหัสจาก seed ในฟอร์มจริง → เช็ก URL
test('login ด้วยบัญชี staff (STAFF) สำเร็จ ต้องถูกพาไปหน้า check', async ({ page }) => {
  await page.goto('/login')

  await submitLogin(page, 'staff', 'ChangeMe123!')

  // STAFF ไป /employee/check ตาม homeByRole
  await expect(page).toHaveURL(/\/employee\/check$/)
  console.log('login ด้วยบัญชี staff (STAFF) สำเร็จ ต้องถูกพาไปหน้า check ✅')
})

// ทดสอบ: kitchen login สำเร็จแล้วต้องไปหน้า /employee/order
// วิธี: กรอก kitchen + รหัสจาก seed ในฟอร์มจริง → เช็ก URL
test('login ด้วยบัญชี kitchen (KITCHEN) สำเร็จ ต้องถูกพาไปหน้า kitchen', async ({
  page,
}) => {
  await page.goto('/login')

  await submitLogin(page, 'kitchen', 'ChangeMe123!')

  await expect(page).toHaveURL(/\/employee\/order$/)
  console.log('login ด้วยบัญชี kitchen (KITCHEN) สำเร็จ ต้องถูกพาไปหน้า order ✅')
})
