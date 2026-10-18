import { test, expect } from '@playwright/test'

// ไม่ต้องพึ่ง backend — ProtectedRoute เช็คจาก localStorage อย่างเดียว ไม่เรียก API
// ยังไม่ login → ทุกหน้า (พนักงาน/เจ้าของร้าน) เด้งไป /login หน้าเดียวกัน

test('เข้าหน้าพนักงานโดยยังไม่ login ต้องเด้งไปหน้า login', async ({ page }) => {
  await page.goto('/employee/order')

  await expect(page).toHaveURL(/\/login$/)
})

test('เข้าหน้าเจ้าของร้านโดยยังไม่ login ต้องเด้งไปหน้า login เดียวกัน', async ({ page }) => {
  await page.goto('/owner/dashboard')

  await expect(page).toHaveURL(/\/login$/)
})
