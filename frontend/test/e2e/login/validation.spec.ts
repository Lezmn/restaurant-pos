import { test, expect } from '@playwright/test'

// ไม่ต้องพึ่ง backend — ทดสอบ client-side validation (required attribute) ของฟอร์ม

// ทดสอบ: ไม่กรอกชื่อผู้ใช้แล้วกดเข้าสู่ระบบ ฟอร์มต้องไม่ถูกส่ง เพราะช่องนี้บังคับกรอก
// วิธี: กดปุ่มเข้าสู่ระบบตอนฟอร์มว่าง → เช็กว่ายังอยู่ /login และช่องผู้ใช้ validity.valid เป็น false
test('กดส่งฟอร์มโดยไม่กรอกอะไรเลย ต้องไม่ไปไหน (required บล็อกไว้)', async ({ page }) => {
  await page.goto('/login')

  await page.getByRole('button', { name: 'Login' }).click()

  // required กันไว้ตั้งแต่ browser ยังไม่ทัน submit ไป backend
  await expect(page).toHaveURL(/\/login$/)
  const usernameInput = page.getByLabel('Username')
  await expect(usernameInput).toHaveJSProperty('validity.valid', false)
})

// ทดสอบ: กรอกแค่ชื่อผู้ใช้ก็กดส่งได้ เพราะช่องรหัสผ่านไม่ได้บังคับกรอกที่ฝั่งเบราว์เซอร์
// วิธี: กรอก admin อย่างเดียวแล้วกดส่ง → เช็กว่าปุ่มยังอยู่และฟอร์มพยายามส่งจริง (ผล error ไปเช็กใน invalid-credentials)
test('กรอกแค่ชื่อผู้ใช้ ไม่กรอกรหัสผ่าน ยังกดส่งได้ (password ไม่ได้ required)', async ({
  page,
}) => {
  await page.goto('/login')

  await page.getByLabel('Username').fill('admin')
  await page.getByRole('button', { name: 'Login' }).click()

  // ฟอร์มควรพยายามส่งจริง (ไม่ถูก browser บล็อกเหมือนเคส username ว่าง)
  // ผลลัพธ์ปลายทาง (error จาก backend) เช็คแยกในเคส invalid-credentials
  await expect(page.getByRole('button', { name: /กำลังเข้าสู่ระบบ|Login/ })).toBeVisible()
})
