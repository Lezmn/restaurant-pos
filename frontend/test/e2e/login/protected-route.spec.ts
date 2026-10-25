import { test, expect } from '@playwright/test'

// ไม่ต้องพึ่ง backend — ProtectedRoute เช็คจาก localStorage อย่างเดียว ไม่เรียก API
// ยังไม่ login → ทุกหน้า (พนักงาน/เจ้าของร้าน) เด้งไป /login หน้าเดียวกัน

// ทดสอบ: ยังไม่ login แล้วเปิดหน้าพนักงาน ต้องถูกพาไปหน้า /login
// วิธี: เปิด /employee/order ตรง ๆ โดยไม่มี token → เช็กว่า URL เปลี่ยนเป็น /login
test('เข้าหน้าพนักงานโดยยังไม่ login ต้องเด้งไปหน้า login', async ({ page }) => {
  await page.goto('/employee/order')

  await expect(page).toHaveURL(/\/login$/)
})

// ทดสอบ: ยังไม่ login แล้วเปิดหน้าเจ้าของร้าน ต้องถูกพาไปหน้า /login หน้าเดียวกัน
// วิธี: เปิด /owner/dashboard ตรง ๆ โดยไม่มี token → เช็กว่า URL เปลี่ยนเป็น /login
test('เข้าหน้าเจ้าของร้านโดยยังไม่ login ต้องเด้งไปหน้า login เดียวกัน', async ({ page }) => {
  await page.goto('/owner/dashboard')

  await expect(page).toHaveURL(/\/login$/)
})
