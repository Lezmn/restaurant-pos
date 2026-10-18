import { test, expect } from '@playwright/test'
import { loginAsAdmin } from '../helpers'

// ⚠️ ต้องรัน backend จริง + seed data ที่ localhost:3000
// UsersPage ยังเป็นแค่หน้า placeholder (ดู src/pages/employee/UsersPage.tsx) — เทสนี้เช็คตามสภาพจริงปัจจุบัน
// ถ้าทำหน้านี้เสร็จแล้วในอนาคต ต้องมาอัปเดตเทสนี้ใหม่ให้ตรงกับของจริง

test('admin เข้าหน้าผู้ใช้งานได้ เห็น title ถูกต้อง (หน้ายังไม่ implement จริง)', async ({
  page,
  request,
}) => {
  await loginAsAdmin(page, request)
  await page.goto('/employee/users')

  await expect(page.getByRole('heading', { name: 'ผู้ใช้งาน' })).toBeVisible()
  await expect(page.getByText('จัดการพนักงานและสิทธิ์')).toBeVisible()
})
