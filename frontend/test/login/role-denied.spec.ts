import { test, expect } from '@playwright/test'
import { submitLogin } from '../helpers'

// ⚠️ ต้องรัน backend จริง + seed data ที่ localhost:3000
// เดิมเทสหน้า /owner/login ที่จำกัดเฉพาะ ADMIN — ตอนนี้ login รวมหน้าเดียว (ทุก role login ได้)
// สิทธิ์จึงไปกันที่หน้าปลายทางแทน: หน้าเจ้าของร้าน (/owner/*) เข้าได้เฉพาะ ADMIN
// role อื่นจะถูก ProtectedRoute เด้งกลับ /employee → ต่อไปหน้าแรกของ role ตัวเอง

test('login ด้วยบัญชี staff (STAFF) แล้วเข้าหน้าเจ้าของร้าน ต้องถูกเด้งกลับหน้าแรกของ STAFF', async ({
  page,
}) => {
  await page.goto('/login')
  await submitLogin(page, 'staff', 'ChangeMe123!')
  await expect(page).toHaveURL(/\/employee\/check$/)

  await page.goto('/owner/dashboard')

  await expect(page).toHaveURL(/\/employee\/check$/)
})

test('login ด้วยบัญชี kitchen (KITCHEN) แล้วเข้าหน้าเจ้าของร้าน ต้องถูกเด้งกลับหน้าแรกของ KITCHEN', async ({
  page,
}) => {
  await page.goto('/login')
  await submitLogin(page, 'kitchen', 'ChangeMe123!')
  await expect(page).toHaveURL(/\/employee\/order$/)

  await page.goto('/owner/finance')

  await expect(page).toHaveURL(/\/employee\/order$/)
})
