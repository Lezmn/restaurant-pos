import { test, expect } from '@playwright/test'
import { loginViaApi, setAuthState } from '../helpers'

// ⚠️ ต้องรัน backend จริง + seed data ที่ localhost:3000
// ต้องใช้ token จริงจาก login API เท่านั้น เพราะหน้า /employee ยิง API จริงทันทีที่เข้า
// (token ปลอมจะโดน apiClient เช็ค 401 แล้วเด้งกลับไป login เอง — ดูรายละเอียดใน helpers.ts)
//
// หน้า login รวมเหลือ /login หน้าเดียวทุก role (เดิมแยก /employee/login กับ /owner/login)
// login อยู่แล้วเข้า /login ซ้ำ → เด้งไป /employee แล้วต่อไปหน้าแรกตาม role (homeByRole)

test('login อยู่แล้ว (ADMIN) เข้าหน้า login ซ้ำ ต้องถูกเด้งออกไปหน้าแรกของ ADMIN', async ({
  page,
  request,
}) => {
  const { accessToken, user } = await loginViaApi(request, 'admin', 'ChangeMe123!')

  await page.goto('/login')
  await setAuthState(page, accessToken, user)
  await page.reload()

  await expect(page).toHaveURL(/\/employee\/order$/)
})

test('login อยู่แล้ว (STAFF) เข้าหน้า login ซ้ำ ต้องถูกเด้งไปหน้าแรกของ STAFF (/employee/check)', async ({
  page,
  request,
}) => {
  const { accessToken, user } = await loginViaApi(request, 'staff', 'ChangeMe123!')

  await page.goto('/login')
  await setAuthState(page, accessToken, user)
  await page.reload()

  await expect(page).toHaveURL(/\/employee\/check$/)
})
