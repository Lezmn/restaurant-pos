import { test, expect } from '@playwright/test'

// ไม่ต้องพึ่ง backend — เช็คแค่ว่า UI ของฟอร์ม login ขึ้นครบ

test('หน้า login แสดงฟอร์มครบ', async ({ page }) => {
  await page.goto('/login')

  // หัวข้อเป็นชื่อร้าน (VITE_RESTAURANT_NAME) — ไม่มีหัวข้อ "เข้าสู่ระบบ" แล้วตั้งแต่ออกแบบหน้า login ใหม่
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  await expect(page.getByLabel('Username')).toBeVisible()
  await expect(page.getByLabel('Password')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Login' })).toBeEnabled()
})

// ลิงก์เก่าที่อาจถูก bookmark ไว้ ต้องพามาหน้า login รวม ไม่ใช่ 404
for (const oldPath of ['/employee/login', '/owner/login']) {
  test(`ลิงก์ login เก่า ${oldPath} ต้องพามาหน้า /login`, async ({ page }) => {
    await page.goto(oldPath)

    await expect(page).toHaveURL(/\/login$/)
    await expect(page.getByLabel('Username')).toBeVisible()
  })
}
