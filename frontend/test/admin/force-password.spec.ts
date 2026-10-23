import { test, expect } from '@playwright/test'
import { call, ok, tokens } from '../api/api-helpers'
import { loginViaApi, submitLogin } from '../helpers'

// ADMIN ที่ได้รหัสชั่วคราว (ส่งมอบระบบ / ADMIN อีกคนตั้งให้) ต้องตั้งรหัสใหม่ก่อนใช้งาน
// backend บล็อกทุก API ยกเว้น /auth/me กับ /auth/password ส่วนหน้าเว็บแสดงหน้าตั้งรหัสใหม่แทนทุกหน้า
// สร้าง ADMIN ใหม่ทุกรอบ แล้วปิดใช้งานตอนจบ — ไม่แตะบัญชี admin ของ seed ที่เทสอื่นใช้

const TEMP_PASSWORD = 'TempOwner1'
const NEW_PASSWORD = 'MyOwnPass22'

async function createTempAdmin(request: Parameters<typeof tokens>[0], adminToken: string) {
  const username = `owner${Date.now().toString(36)}`
  const user = await ok<{ id: string; mustChangePassword: boolean }>(
    await call(request, 'POST', '/users', {
      token: adminToken,
      data: { name: `ผู้จัดการ ${username}`, email: `${username}@restaurant.local`, password: TEMP_PASSWORD, role: 'ADMIN' },
    }),
  )
  return { username, user }
}

test('API: ADMIN รหัสชั่วคราวเรียก API อื่นไม่ได้ (403) จนกว่าจะเปลี่ยนรหัส', async ({ request }) => {
  const t = await tokens(request)
  const { username, user } = await createTempAdmin(request, t.ADMIN)
  expect(user.mustChangePassword).toBe(true)

  try {
    const login = await loginViaApi(request, username, TEMP_PASSWORD)
    const blocked = await call(request, 'GET', '/tables', { token: login.accessToken })
    expect(blocked.status()).toBe(403)
    expect(await blocked.json()).toMatchObject({ code: 'PASSWORD_CHANGE_REQUIRED' })
    // /auth/me ยังเรียกได้ (หน้าเว็บใช้เช็คสถานะ)
    expect((await call(request, 'GET', '/auth/me', { token: login.accessToken })).status()).toBe(200)

    await ok(
      await call(request, 'PATCH', '/auth/password', {
        token: login.accessToken,
        data: { currentPassword: TEMP_PASSWORD, newPassword: NEW_PASSWORD },
      }),
    )
    const after = await loginViaApi(request, username, NEW_PASSWORD)
    expect((await call(request, 'GET', '/tables', { token: after.accessToken })).status()).toBe(200)
  } finally {
    await call(request, 'PATCH', `/users/${user.id}`, { token: t.ADMIN, data: { isActive: false } })
  }
})

test('หน้าเว็บ: login ด้วยรหัสชั่วคราว → เจอหน้าตั้งรหัสใหม่ → ตั้งแล้วเข้าใช้งานได้ รหัสเดิมใช้ไม่ได้', async ({
  page,
  request,
}) => {
  const t = await tokens(request)
  const { username, user } = await createTempAdmin(request, t.ADMIN)

  try {
    await page.goto('/login')
    await submitLogin(page, username, TEMP_PASSWORD)

    await expect(page.getByRole('heading', { name: 'ตั้งรหัสผ่านใหม่ก่อนใช้งาน' })).toBeVisible()
    await page.getByLabel('รหัสผ่านชั่วคราว (ที่ใช้ login เมื่อกี้)').fill(TEMP_PASSWORD)
    // ป้ายมีคำใบ้ต่อท้าย "รหัสผ่านใหม่(อย่างน้อย 8 ตัวอักษร)"
    await page.getByLabel(/^รหัสผ่านใหม่/).fill(NEW_PASSWORD)
    await page.getByLabel('ยืนยันรหัสผ่านใหม่').fill(NEW_PASSWORD)
    await page.getByRole('button', { name: 'เปลี่ยนรหัสผ่าน' }).click()

    // bcrypt (cost 12) ช้าตั้งใจ — ตอนรันขนานหลาย worker บันทึกเกิน 5 วินาทีได้
    await expect(page.getByRole('heading', { name: 'ตั้งรหัสผ่านใหม่ก่อนใช้งาน' })).toHaveCount(0, { timeout: 15_000 })
    await expect(page).toHaveURL(/\/employee\//)

    const oldLogin = await call(request, 'POST', '/auth/login', {
      data: { email: `${username}@restaurant.local`, password: TEMP_PASSWORD },
    })
    expect(oldLogin.status()).toBe(401)
  } finally {
    await call(request, 'PATCH', `/users/${user.id}`, { token: t.ADMIN, data: { isActive: false } })
  }
})
