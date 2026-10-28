import { test, expect, type Route } from '@playwright/test'
import { call, tokens } from '../api/api-helpers'
import { API_URL, loginAsAdmin } from '../helpers'

// ⚠️ ต้องรัน backend จริง + seed data (DB ทดสอบเท่านั้น)
// หน้า "แจ้งเตือน LINE" (/owner/line) — เจ้าของร้านวาง Channel access token + User ID เอง
// ห้ามยิง LINE จริงจากเทสต์: ดัก POST /settings/line/test และ PUT /settings/line ด้วย page.route
// (ถ้าบันทึก token ปลอมลง DB จริง เทสต์ปิดยอดจะพยายามส่งสรุปเข้า LINE ด้วย token นั้น)
test.use({ viewport: { width: 1280, height: 900 } })

const USER_ID = `U${'0123456789abcdef'.repeat(2)}`
const TOKEN = 'e2e-fake-channel-access-token-abcd'
const apiOrigin = new URL(API_URL).origin
const isApi = (path: string) => (url: URL) => url.origin === apiOrigin && url.pathname === path

// ทดสอบ: ADMIN ตั้งค่า LINE ได้ครบ — ฟอร์มกันค่าผิด (token สั้น / User ID ผิดรูปแบบ), กดส่งข้อความทดสอบแล้วเห็นผลทั้งสำเร็จและไม่สำเร็จ, บันทึกแล้วสถานะเป็น "เชื่อมต่อแล้ว" และหน้าไม่โชว์ token เต็ม
// วิธี: ดัก /settings/line/test (ครั้งแรกตอบสำเร็จ ครั้งที่สองตอบว่ายังไม่แอดเพื่อน) และ PUT /settings/line (ตอบค่าที่บันทึกแล้ว) → admin เปิด /owner/line เห็นว่ายังไม่เชื่อม → ใส่ token สั้น/User ID ผิด เช็กข้อความเตือนและปุ่มกดไม่ได้ → ใส่ค่าถูก กดทดสอบ 2 ครั้ง เช็ก body ที่ส่งและข้อความผล → กดบันทึก เช็ก body, toast, สถานะเชื่อมต่อแล้ว และช่อง token ว่างพร้อมบอก 4 ตัวท้าย → เช็กผ่าน API ว่าค่าจริงใน DB ไม่ถูกแก้ (mock ทำงานจริง)
test('ADMIN ตั้งค่า LINE: กันค่าผิด, ส่งข้อความทดสอบ (สำเร็จ/ไม่สำเร็จ), บันทึกแล้วขึ้นเชื่อมต่อแล้ว', async ({ page, request }) => {
  const t = await tokens(request)
  const before = await (await call(request, 'GET', '/settings/line', { token: t.ADMIN })).json()

  const testBodies: unknown[] = []
  const testReplies = [
    { ok: true, message: 'ส่งข้อความทดสอบแล้ว — เช็คใน LINE ได้เลย' },
    { ok: false, message: 'ยังไม่ได้แอด LINE OA เป็นเพื่อน (E2E)' },
  ]
  await page.route(isApi('/settings/line/test'), async (route: Route) => {
    testBodies.push(route.request().postDataJSON())
    await route.fulfill({ json: testReplies[Math.min(testBodies.length - 1, 1)] })
  })
  let savedBody: unknown
  await page.route(isApi('/settings/line'), async (route: Route) => {
    if (route.request().method() !== 'PUT') return route.continue()
    savedBody = route.request().postDataJSON()
    await route.fulfill({
      json: {
        enabled: true,
        to: USER_ID,
        hasToken: true,
        tokenHint: '••••abcd',
        source: 'database',
        tokenUnreadable: false,
        ready: true,
      },
    })
  })

  await loginAsAdmin(page, request)
  await page.goto('/owner/line')
  await expect(page.getByRole('heading', { name: 'แจ้งเตือน LINE' })).toBeVisible()
  await expect(page.getByText(/ยังไม่ได้เชื่อม LINE/)).toBeVisible()
  await expect(page.getByRole('heading', { name: /วิธีเชื่อม LINE/ })).toBeVisible()

  const tokenField = page.getByLabel(/Channel access token/)
  const userField = page.getByLabel(/User ID ของคุณ/)
  const testButton = page.getByRole('button', { name: 'ส่งข้อความทดสอบ' })
  const saveButton = page.getByRole('button', { name: 'บันทึก', exact: true })

  await test.step('ค่าผิดรูปแบบ → เตือนและกดไม่ได้', async () => {
    await expect(saveButton).toBeDisabled()
    await tokenField.fill('short-token')
    await expect(page.getByText(/token สั้นผิดปกติ/)).toBeVisible()
    await userField.fill('U123')
    await expect(page.getByText(/ต้องขึ้นต้นด้วย U ตามด้วยตัวอักษร/)).toBeVisible()
    await expect(testButton).toBeDisabled()
    await expect(saveButton).toBeDisabled()
  })

  await test.step('ส่งข้อความทดสอบ: สำเร็จ แล้วไม่สำเร็จ', async () => {
    await tokenField.fill(TOKEN)
    await userField.fill(USER_ID)
    await expect(page.getByText(/token สั้นผิดปกติ/)).toHaveCount(0)
    await testButton.click()
    await expect(page.getByRole('status').filter({ hasText: 'ส่งข้อความทดสอบแล้ว' })).toContainText('✅')
    expect(testBodies[0]).toEqual({ to: USER_ID, token: TOKEN })

    await testButton.click()
    await expect(page.getByRole('status').filter({ hasText: 'ยังไม่ได้แอด LINE OA เป็นเพื่อน (E2E)' })).toBeVisible()
    expect(testBodies).toHaveLength(2)
  })

  await test.step('บันทึก → เชื่อมต่อแล้ว ช่อง token ว่าง บอกแค่ 4 ตัวท้าย', async () => {
    await expect(saveButton).toBeEnabled()
    await saveButton.click()
    await expect(page.getByText('บันทึกการตั้งค่า LINE แล้ว')).toBeVisible()
    expect(savedBody).toEqual({ enabled: true, to: USER_ID, token: TOKEN })
    await expect(page.getByText(/เชื่อมต่อแล้ว — จะส่งสรุปยอดทุกครั้งที่ปิดยอดวัน/)).toBeVisible()
    await expect(tokenField).toHaveValue('')
    await expect(tokenField).toHaveAttribute('placeholder', /บันทึกไว้แล้ว \(••••abcd\)/)
    // ยังไม่แก้อะไรหลังบันทึก — ปุ่มบันทึกกดไม่ได้ (ไม่มีอะไรเปลี่ยน)
    await expect(saveButton).toBeDisabled()
  })

  // ค่าใน DB จริงต้องเหมือนก่อนเทสต์ — PUT ถูกดักไว้ ไม่มี token ปลอมหลุดไปเก็บ
  const after = await (await call(request, 'GET', '/settings/line', { token: t.ADMIN })).json()
  expect(after).toEqual(before)
})

// ทดสอบ: ตั้งค่า LINE เป็นของ ADMIN เท่านั้น — STAFF/KITCHEN อ่าน บันทึก หรือสั่งส่งข้อความทดสอบไม่ได้ (403) และ response ของ ADMIN ไม่มี token เต็ม
// วิธี: ยิง GET/PUT /settings/line และ POST /settings/line/test ด้วย token ของ STAFF และ KITCHEN → เช็ก 403 ทุกตัว → ยิง GET ด้วย ADMIN เช็กว่าไม่มีช่อง token
test('STAFF/KITCHEN เรียก /settings/line ไม่ได้ (403) และ ADMIN ไม่ได้ token เต็มกลับมา', async ({ request }) => {
  const t = await tokens(request)
  for (const role of ['STAFF', 'KITCHEN'] as const) {
    expect((await call(request, 'GET', '/settings/line', { token: t[role] })).status(), `${role} GET`).toBe(403)
    expect(
      (await call(request, 'PUT', '/settings/line', { token: t[role], data: { enabled: true, to: USER_ID, token: TOKEN } })).status(),
      `${role} PUT`,
    ).toBe(403)
    expect(
      (await call(request, 'POST', '/settings/line/test', { token: t[role], data: { to: USER_ID, token: TOKEN } })).status(),
      `${role} POST test`,
    ).toBe(403)
  }
  const settings = await (await call(request, 'GET', '/settings/line', { token: t.ADMIN })).json()
  expect(settings).not.toHaveProperty('token')
})
