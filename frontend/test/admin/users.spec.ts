import { test, expect } from '@playwright/test'
import { API_URL, loginAsAdmin, loginViaApi, submitLogin } from '../helpers'

// ⚠️ ต้องรัน backend จริง + seed data — เทสนี้สร้างบัญชีพนักงานจริง (ชื่อสุ่มต่อรอบ)

/** ชื่อผู้ใช้ไม่ซ้ำกันทุกรอบ — รันซ้ำกับ DB เดิมได้ */
const uniqueUsername = () => `e2e${Date.now().toString(36)}`

test('admin เข้าหน้าพนักงาน เห็นรายชื่อจาก seed พร้อมสิทธิ์ และตัวเองมีป้าย (คุณ)', async ({
  page,
  request,
}) => {
  await loginAsAdmin(page, request)
  await page.goto('/employee/users')

  await expect(page.getByRole('heading', { name: 'พนักงาน' })).toBeVisible()
  await expect(page.getByText('ชื่อผู้ใช้: staff', { exact: true })).toBeVisible()
  await expect(page.getByText('ชื่อผู้ใช้: kitchen', { exact: true })).toBeVisible()
  await expect(page.getByText('(คุณ)')).toBeVisible()
  // บัญชีตัวเองปิดใช้งาน/ลบไม่ได้
  await expect(page.getByRole('button', { name: 'ปิดใช้งาน Admin' })).toHaveCount(0)
})

test('admin เพิ่มพนักงานใหม่ → พนักงาน login ได้ → ปิดใช้งานแล้ว login ไม่ได้', async ({
  page,
  request,
}) => {
  const username = uniqueUsername()
  const password = 'Welcome2Shop!'

  await loginAsAdmin(page, request)
  await page.goto('/employee/users')
  await page.getByRole('button', { name: 'เพิ่มพนักงาน', exact: true }).click()

  const dialog = page.getByRole('dialog')
  await dialog.getByLabel('ชื่อที่แสดง').fill('พนักงานทดสอบ E2E')
  await dialog.getByLabel('ชื่อผู้ใช้ (ใช้ตอน login)').fill(username)
  await dialog.getByLabel(/ครัว/).check()
  await dialog.getByLabel(/รหัสผ่านเริ่มต้น/).fill(password)
  await dialog.getByLabel('ยืนยันรหัสผ่าน').fill(password)
  await dialog.getByRole('button', { name: 'เพิ่มพนักงาน' }).click()

  await expect(page.getByText(`ชื่อผู้ใช้: ${username}`, { exact: true })).toBeVisible()

  // พนักงานใหม่ login ได้จริง และได้สิทธิ์ตามที่เลือก
  const created = await loginViaApi(request, username, password)
  expect(created.user.role).toBe('KITCHEN')

  // ปิดใช้งาน → login ไม่ได้ และ token เดิมใช้ต่อไม่ได้ทันที
  await page.getByRole('button', { name: 'ปิดใช้งาน พนักงานทดสอบ E2E' }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'ปิดใช้งาน' }).click()
  await expect(page.getByText('ปิดใช้งาน — เข้าสู่ระบบไม่ได้')).toBeVisible()

  const me = await request.get(`${API_URL}/auth/me`, {
    headers: { Authorization: `Bearer ${created.accessToken}` },
  })
  expect(me.status()).toBe(401)

  await page.evaluate(() => localStorage.clear())
  await page.goto('/login')
  await submitLogin(page, username, password)
  await expect(page.getByText('ถูกปิดใช้งาน')).toBeVisible()
})

test('ร้านต้องมี ADMIN อย่างน้อย 1 คน: เปลี่ยนสิทธิ์ตัวเองไม่ได้', async ({ page, request }) => {
  await loginAsAdmin(page, request)
  await page.goto('/employee/users')
  await page.getByRole('button', { name: 'แก้ไข Admin' }).click()

  const dialog = page.getByRole('dialog')
  await expect(dialog.getByText('เปลี่ยนสิทธิ์ของบัญชีตัวเองไม่ได้')).toBeVisible()
  await expect(dialog.getByLabel(/พนักงานหน้าร้าน/)).toBeDisabled()
})
