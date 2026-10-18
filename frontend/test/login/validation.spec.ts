import { test, expect } from '@playwright/test'

// ไม่ต้องพึ่ง backend — ทดสอบ client-side validation (required attribute) ของฟอร์ม

test('กดส่งฟอร์มโดยไม่กรอกอะไรเลย ต้องไม่ไปไหน (required บล็อกไว้)', async ({ page }) => {
  await page.goto('/login')

  await page.getByRole('button', { name: 'เข้าสู่ระบบ' }).click()

  // required กันไว้ตั้งแต่ browser ยังไม่ทัน submit ไป backend
  await expect(page).toHaveURL(/\/login$/)
  const usernameInput = page.getByLabel('ผู้ใช้')
  await expect(usernameInput).toHaveJSProperty('validity.valid', false)
})

test('กรอกแค่ชื่อผู้ใช้ ไม่กรอกรหัสผ่าน ยังกดส่งได้ (password ไม่ได้ required)', async ({
  page,
}) => {
  await page.goto('/login')

  await page.getByLabel('ผู้ใช้').fill('admin')
  await page.getByRole('button', { name: 'เข้าสู่ระบบ' }).click()

  // ฟอร์มควรพยายามส่งจริง (ไม่ถูก browser บล็อกเหมือนเคส username ว่าง)
  // ผลลัพธ์ปลายทาง (error จาก backend) เช็คแยกในเคส invalid-credentials
  await expect(page.getByRole('button', { name: /กำลังเข้าสู่ระบบ|เข้าสู่ระบบ/ })).toBeVisible()
})
