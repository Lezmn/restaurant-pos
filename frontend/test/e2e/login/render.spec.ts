import { test, expect } from '@playwright/test'

// ไม่ต้องพึ่ง backend — เช็คแค่ว่า UI ของฟอร์ม login ขึ้นครบ

// ทดสอบ: หน้า login แสดงหัวข้อ ชื่อร้าน ช่องผู้ใช้ ช่องรหัสผ่าน และปุ่มเข้าสู่ระบบครบ
// วิธี: เปิด /login → เช็กว่าทุกส่วนมองเห็นได้ และปุ่มกดได้
test('หน้า login แสดงฟอร์มครบ', async ({ page }) => {
  await page.goto('/login')

  await expect(page.getByRole('heading', { name: 'เข้าสู่ระบบ' })).toBeVisible()
  await expect(page.getByText('ร้านอาหาร', { exact: true })).toBeVisible()
  await expect(page.getByLabel('ผู้ใช้')).toBeVisible()
  await expect(page.getByLabel('รหัสผ่าน')).toBeVisible()
  await expect(page.getByRole('button', { name: 'เข้าสู่ระบบ' })).toBeEnabled()
})

// ลิงก์เก่าที่อาจถูก bookmark ไว้ ต้องพามาหน้า login รวม ไม่ใช่ 404
for (const oldPath of ['/employee/login', '/owner/login']) {
  // ทดสอบ: ลิงก์ login แบบเก่าที่อาจถูก bookmark ไว้ ต้องพามาหน้า /login ไม่ขึ้น 404
  // วิธี: วนเปิด /employee/login และ /owner/login → เช็กว่า URL เป็น /login และเห็นช่องผู้ใช้
  test(`ลิงก์ login เก่า ${oldPath} ต้องพามาหน้า /login`, async ({ page }) => {
    await page.goto(oldPath)

    await expect(page).toHaveURL(/\/login$/)
    await expect(page.getByLabel('ผู้ใช้')).toBeVisible()
  })
}
