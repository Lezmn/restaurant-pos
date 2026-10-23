import { test, expect } from '@playwright/test'
import { API_URL, loginAsAdmin, loginViaApi, submitLogin } from '../helpers'

// ⚠️ ต้องรัน backend จริง + seed data — เทสนี้สร้างบัญชีจริง (ชื่อสุ่มต่อรอบ)
// ร้านใช้บัญชีกลางตามตำแหน่ง: ครัว 1 บัญชี, หน้าร้าน 1 บัญชี

/** ชื่อผู้ใช้ไม่ซ้ำกันทุกรอบ — รันซ้ำกับ DB เดิมได้ */
const uniqueUsername = () => `e2e${Date.now().toString(36)}`

test('admin เข้าหน้าบัญชีผู้ใช้ เห็นบัญชีจาก seed พร้อมสิทธิ์ และตัวเองมีป้าย (คุณ)', async ({
  page,
  request,
}) => {
  await loginAsAdmin(page, request)
  await page.goto('/employee/users')

  await expect(page.getByRole('heading', { name: 'บัญชีผู้ใช้' })).toBeVisible()
  await expect(page.getByText('ชื่อผู้ใช้: staff', { exact: true })).toBeVisible()
  await expect(page.getByText('ชื่อผู้ใช้: kitchen', { exact: true })).toBeVisible()
  await expect(page.getByText('(คุณ)')).toBeVisible()
  // บัญชีตัวเองปิดใช้งาน/ลบไม่ได้
  await expect(page.getByRole('button', { name: 'ปิดใช้งาน Admin' })).toHaveCount(0)
})

test('admin เพิ่มบัญชีครัว → login ได้ → ปิดใช้งานแล้ว login ไม่ได้', async ({
  page,
  request,
}) => {
  const username = uniqueUsername()
  const password = 'Welcome2Shop!'

  await loginAsAdmin(page, request)
  await page.goto('/employee/users')
  await page.getByRole('button', { name: 'เพิ่มบัญชี', exact: true }).click()

  const dialog = page.getByRole('dialog')
  const name = `ครัวทดสอบ ${username}`
  await dialog.getByLabel('ชื่อบัญชี / ตำแหน่ง').fill(name)
  await dialog.getByLabel('ชื่อผู้ใช้ (ใช้ตอน login)').fill(username)
  await dialog.getByLabel(/ครัว/).check()
  await dialog.getByLabel(/รหัสผ่านเริ่มต้น/).fill(password)
  await dialog.getByLabel('ยืนยันรหัสผ่าน').fill(password)
  await dialog.getByRole('button', { name: 'เพิ่มบัญชี' }).click()

  await expect(page.getByText(`ชื่อผู้ใช้: ${username}`, { exact: true })).toBeVisible()

  // บัญชีใหม่ login ได้จริง และได้สิทธิ์ตามที่เลือก
  const created = await loginViaApi(request, username, password)
  expect(created.user.role).toBe('KITCHEN')

  // ปิดใช้งาน → login ไม่ได้ และ token เดิมใช้ต่อไม่ได้ทันที
  await page.getByRole('button', { name: `ปิดใช้งาน ${name}` }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'ปิดใช้งาน' }).click()
  // ดูเฉพาะการ์ดของบัญชีนี้ — DB ที่รันซ้ำอาจมีบัญชีที่ปิดใช้งานจากรอบก่อนอยู่แล้ว
  const card = page.getByRole('listitem').filter({ hasText: `ชื่อผู้ใช้: ${username}` })
  await expect(card.getByText('ปิดใช้งาน — เข้าสู่ระบบไม่ได้')).toBeVisible()

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

test('มีคนลาออก: ตั้งรหัสใหม่ + ออกจากระบบทุกเครื่อง → token เดิมใช้ไม่ได้ รหัสเดิม login ไม่ได้', async ({
  page,
  request,
}) => {
  const username = uniqueUsername()
  await loginAsAdmin(page, request)
  const admin = await loginViaApi(request, 'admin', 'ChangeMe123!')
  const created = await request.post(`${API_URL}/users`, {
    headers: { Authorization: `Bearer ${admin.accessToken}` },
    data: { name: `หน้าร้าน ${username}`, email: `${username}@restaurant.local`, password: 'OldShared1', role: 'STAFF' },
  })
  expect(created.status()).toBe(201)
  const tablet = await loginViaApi(request, username, 'OldShared1')

  await page.goto('/employee/users')
  await page.getByRole('button', { name: `ตั้งรหัสผ่านใหม่ให้ หน้าร้าน ${username}` }).click()
  const dialog = page.getByRole('dialog')
  await dialog.getByLabel(/^รหัสผ่านใหม่/).fill('NewShared22')
  await dialog.getByLabel('ยืนยันรหัสผ่านใหม่').fill('NewShared22')
  await expect(dialog.getByLabel('ออกจากระบบทุกเครื่องที่ใช้บัญชีนี้')).toBeChecked()
  await dialog.getByRole('button', { name: 'ตั้งรหัสผ่าน' }).click()
  // bcrypt (cost 12) ช้าตั้งใจ — ตอนรันขนานหลาย worker CPU เต็ม บันทึกเกิน 5 วินาทีได้
  await expect(page.getByText(/ทุกเครื่องต้อง login ใหม่/)).toBeVisible({ timeout: 15_000 })

  const me = await request.get(`${API_URL}/auth/me`, {
    headers: { Authorization: `Bearer ${tablet.accessToken}` },
  })
  expect(me.status()).toBe(401)
  const oldLogin = await request.post(`${API_URL}/auth/login`, {
    data: { email: `${username}@restaurant.local`, password: 'OldShared1' },
  })
  expect(oldLogin.status()).toBe(401)
  await loginViaApi(request, username, 'NewShared22')
})

test('บัญชีครัว/หน้าร้านไม่เห็นปุ่มเปลี่ยนรหัสผ่านของตัวเอง (ADMIN เห็น)', async ({ page, request }) => {
  await loginAsAdmin(page, request)
  await page.goto('/employee/manage')
  await expect(page.getByRole('button', { name: 'เปลี่ยนรหัสผ่าน' })).toBeVisible()

  const staff = await loginViaApi(request, 'staff', 'ChangeMe123!')
  await page.evaluate(
    ([token, u]) => {
      localStorage.setItem('restaurant.token', token as string)
      localStorage.setItem('restaurant.user', JSON.stringify(u))
    },
    [staff.accessToken, staff.user] as const,
  )
  await page.goto('/employee/check')
  await expect(page.getByText('(Staff · STAFF)')).toBeVisible()
  await expect(page.getByRole('button', { name: 'เปลี่ยนรหัสผ่าน' })).toHaveCount(0)
})
