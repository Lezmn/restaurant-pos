import { test, expect } from '@playwright/test'
import { submitLogin } from '../helpers'

// ⚠️ ต้องรัน backend (NestJS) จริงที่ localhost:3000 เทสนี้ยิง POST /auth/login จริง
//
// เดิมเคสนี้ fail เพราะ src/lib/api-client.ts ดัก 401 ทุก endpoint แล้วรีโหลดไปหน้า login
// (รหัสผิดเลยไม่เคยเห็นข้อความ error) — แก้แล้วเมื่อ 23 ก.ย.: ยกเว้น '/auth/login' ออกจากตัวดัก 401
// ตอนนี้จึงต้องเห็น role="alert" จาก LoginPage.tsx และยังอยู่หน้า /login

test('กรอกรหัสผ่านผิด ต้องขึ้น error และไม่หลุดไปหน้าอื่น', async ({ page }) => {
  await page.goto('/login')

  await submitLogin(page, 'admin', 'wrong-password')

  await expect(page.getByRole('alert')).toBeVisible()
  await expect(page).toHaveURL(/\/login$/)
})

test('กรอก username ที่ไม่มีในระบบ ต้องขึ้น error', async ({ page }) => {
  await page.goto('/login')

  await submitLogin(page, 'not-a-real-user', 'ChangeMe123!')

  await expect(page.getByRole('alert')).toBeVisible()
  await expect(page).toHaveURL(/\/login$/)
})
