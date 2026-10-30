import { test, expect, type APIRequestContext } from '@playwright/test'
import { call, ok, tokens } from '../api/api-helpers'
import { loginViaApi, submitLogin } from '../helpers'

// ADMIN เปลี่ยนรหัสผ่านของตัวเอง (PATCH /auth/password และกล่อง "เปลี่ยนรหัสผ่านของฉัน" ในหน้าบัญชีผู้ใช้)
// สร้าง ADMIN ใหม่ทุกเคส แล้วปิดใช้งานตอนจบ — ไม่แตะรหัสของ admin ใน seed ที่เทสอื่นใช้อยู่

const TEMP_PASSWORD = 'TempOwner1'
const PASSWORD = 'OwnerPass1'
const NEW_PASSWORD = 'OwnerPass2'

/** ADMIN ใหม่ที่ตั้งรหัสเองแล้ว (ผ่านขั้นรหัสชั่วคราวไปแล้ว) พร้อม token */
async function createReadyAdmin(request: APIRequestContext, adminToken: string) {
  const username = `pw${Date.now().toString(36)}${Math.floor(Math.random() * 1000)}`
  const email = `${username}@restaurant.local`
  const user = await ok<{ id: string }>(
    await call(request, 'POST', '/users', {
      token: adminToken,
      data: { name: `เจ้าของ ${username}`, email, password: TEMP_PASSWORD, role: 'ADMIN' },
    }),
  )
  const temp = await loginViaApi(request, username, TEMP_PASSWORD)
  await ok(
    await call(request, 'PATCH', '/auth/password', {
      token: temp.accessToken,
      data: { currentPassword: TEMP_PASSWORD, newPassword: PASSWORD },
    }),
  )
  const login = await loginViaApi(request, username, PASSWORD)
  return { id: user.id, username, email, token: login.accessToken }
}

const loginStatus = async (request: APIRequestContext, email: string, password: string) =>
  (await call(request, 'POST', '/auth/login', { data: { email, password } })).status()

// ทดสอบ: ทุกกรณีที่ API ต้องปฏิเสธการเปลี่ยนรหัส และรหัสเดิมยังใช้ได้หลังถูกปฏิเสธ
// วิธี: สร้าง ADMIN ใหม่ → ยิง PATCH /auth/password ด้วยรหัสปัจจุบันผิด / ใหม่ซ้ำเดิม / สั้น 7 / ยาว 73 / body ว่าง / ไม่มี token
//       → เช็ก status และข้อความ → สุดท้าย login ด้วยรหัสเดิมยังได้ 201 → ปิดบัญชีทิ้ง
test('API: เปลี่ยนรหัสไม่ผ่าน (รหัสเดิมผิด ซ้ำเดิม สั้น ยาวเกิน ไม่ส่ง ไม่ login) → รหัสเดิมยังใช้ได้', async ({
  request,
  playwright,
}) => {
  const t = await tokens(request)
  const admin = await createReadyAdmin(request, t.ADMIN)
  const patch = (data: unknown, token: string | undefined = admin.token) =>
    call(request, 'PATCH', '/auth/password', { token, data })

  try {
    const wrong = await patch({ currentPassword: 'WrongPass9', newPassword: NEW_PASSWORD })
    expect(wrong.status()).toBe(400)
    expect((await wrong.json()).message).toBe('รหัสผ่านปัจจุบันไม่ถูกต้อง')

    const same = await patch({ currentPassword: PASSWORD, newPassword: PASSWORD })
    expect(same.status()).toBe(400)
    expect((await same.json()).message).toBe('รหัสผ่านใหม่ต้องต่างจากรหัสเดิม')

    for (const newPassword of ['a'.repeat(7), 'a'.repeat(73)]) {
      const res = await patch({ currentPassword: PASSWORD, newPassword })
      expect(res.status(), `ยาว ${newPassword.length} ตัว`).toBe(400)
      expect(JSON.stringify(await res.json())).toContain('newPassword')
    }

    expect((await patch({})).status()).toBe(400)
    // ไม่ login: ต้องใช้ context ใหม่ — `request` เก็บ cookie ของการ login ก่อนหน้าไว้ (cookie ก็ใช้ยืนยันตัวได้)
    const anonymous = await playwright.request.newContext()
    try {
      const res = await call(anonymous, 'PATCH', '/auth/password', {
        data: { currentPassword: PASSWORD, newPassword: NEW_PASSWORD },
      })
      expect(res.status()).toBe(401)
    } finally {
      await anonymous.dispose()
    }

    // ถูกปฏิเสธทุกครั้ง → รหัสเดิมยังใช้ได้ และ token เดิมยังใช้งานต่อได้ (พิมพ์ผิดไม่ทำให้หลุดจากระบบ)
    expect(await loginStatus(request, admin.email, PASSWORD)).toBe(201)
    expect((await call(request, 'GET', '/auth/me', { token: admin.token })).status()).toBe(200)
  } finally {
    await call(request, 'PATCH', `/users/${admin.id}`, { token: t.ADMIN, data: { isActive: false } })
  }
})

// ทดสอบ: เปลี่ยนรหัสสำเร็จ → login ด้วยรหัสใหม่ได้ รหัสเดิมไม่ได้ และรหัสยาว 72 ตัวพอดีใช้ได้จริง
// วิธี: สร้าง ADMIN ใหม่ → เปลี่ยนรหัสเป็น NEW_PASSWORD (200 {ok:true}) → login รหัสเดิม 401 รหัสใหม่ 201
//       → เปลี่ยนต่อเป็นรหัส 72 ตัว → login ด้วยรหัส 72 ตัวได้ 201 → ปิดบัญชีทิ้ง
test('API: เปลี่ยนรหัสสำเร็จ → รหัสใหม่ login ได้ รหัสเดิมไม่ได้ (รวมรหัสยาว 72 ตัว)', async ({ request }) => {
  const t = await tokens(request)
  const admin = await createReadyAdmin(request, t.ADMIN)

  try {
    const res = await call(request, 'PATCH', '/auth/password', {
      token: admin.token,
      data: { currentPassword: PASSWORD, newPassword: NEW_PASSWORD },
    })
    expect(res.status()).toBe(200)
    expect(await res.json()).toEqual({ ok: true })
    expect(await loginStatus(request, admin.email, PASSWORD)).toBe(401)
    expect(await loginStatus(request, admin.email, NEW_PASSWORD)).toBe(201)

    const longest = 'L'.repeat(72)
    await ok(
      await call(request, 'PATCH', '/auth/password', {
        token: admin.token,
        data: { currentPassword: NEW_PASSWORD, newPassword: longest },
      }),
    )
    expect(await loginStatus(request, admin.email, longest)).toBe(201)
  } finally {
    await call(request, 'PATCH', `/users/${admin.id}`, { token: t.ADMIN, data: { isActive: false } })
  }
})

// ทดสอบ: บัญชีกลางของครัว/หน้าร้านเปลี่ยนรหัสของตัวเองไม่ได้ (403) แม้ส่งรหัสเดิมถูก และรหัสไม่เปลี่ยน
// วิธี: login staff/kitchen → PATCH /auth/password ด้วยรหัส seed ที่ถูกต้อง → 403 → login ด้วยรหัส seed ยังได้
test('API: STAFF / KITCHEN เปลี่ยนรหัสตัวเองไม่ได้ (403) รหัสไม่เปลี่ยน', async ({ request }) => {
  const t = await tokens(request)
  for (const [role, username] of [['STAFF', 'staff'], ['KITCHEN', 'kitchen']] as const) {
    const res = await call(request, 'PATCH', '/auth/password', {
      token: t[role],
      data: { currentPassword: 'ChangeMe123!', newPassword: 'Hacked1234' },
    })
    expect(res.status(), role).toBe(403)
    expect(await loginStatus(request, `${username}@restaurant.local`, 'ChangeMe123!'), role).toBe(201)
  }
})

// ทดสอบ: ADMIN เปลี่ยนรหัสของตัวเองผ่านหน้าเว็บ — กรอกผิดเห็น error และยังอยู่ในระบบ, กรอกถูกได้ toast และรหัสใหม่ใช้ได้
// วิธี: สร้าง ADMIN ใหม่ → login ผ่านฟอร์ม → /owner/users กด "เปลี่ยนรหัสผ่าน" → กรอกรหัสปัจจุบันผิด กดเปลี่ยน
//       → เห็น "รหัสผ่านปัจจุบันไม่ถูกต้อง" กล่องยังเปิด ยังอยู่หน้าเดิม → แก้รหัสปัจจุบันให้ถูก กดเปลี่ยน → เห็น toast กล่องปิด
//       → ยิง login ด้วยรหัสเดิมได้ 401 รหัสใหม่ได้ 201 → ปิดบัญชีทิ้ง
test('หน้าเว็บ: ADMIN เปลี่ยนรหัสตัวเอง — รหัสเดิมผิดไม่หลุดระบบ, ถูกแล้วรหัสใหม่ใช้ได้', async ({ page, request }) => {
  const t = await tokens(request)
  const admin = await createReadyAdmin(request, t.ADMIN)

  try {
    await page.goto('/login')
    await submitLogin(page, admin.username, PASSWORD)
    await expect(page).toHaveURL(/\/owner\//)
    await page.goto('/owner/users')

    await page.getByRole('button', { name: 'เปลี่ยนรหัสผ่าน' }).click()
    const dialog = page.getByRole('dialog', { name: 'เปลี่ยนรหัสผ่านของฉัน' })
    await expect(dialog).toBeVisible()

    await dialog.getByLabel(/^รหัสผ่านปัจจุบัน/).fill('WrongPass9')
    await dialog.getByLabel(/^รหัสผ่านใหม่/).fill(NEW_PASSWORD)
    await dialog.getByLabel('ยืนยันรหัสผ่านใหม่').fill(NEW_PASSWORD)
    await dialog.getByRole('button', { name: 'เปลี่ยนรหัสผ่าน' }).click()
    // bcrypt (cost 12) ช้าตั้งใจ — รันขนานหลาย worker ตอบเกิน 5 วินาทีได้
    await expect(dialog.getByText('รหัสผ่านปัจจุบันไม่ถูกต้อง')).toBeVisible({ timeout: 15_000 })
    await expect(dialog).toBeVisible()
    await expect(page).toHaveURL(/\/owner\/users/)

    await dialog.getByLabel(/^รหัสผ่านปัจจุบัน/).fill(PASSWORD)
    await dialog.getByRole('button', { name: 'เปลี่ยนรหัสผ่าน' }).click()
    await expect(page.getByText('เปลี่ยนรหัสผ่านแล้ว — ครั้งหน้าใช้รหัสใหม่')).toBeVisible({ timeout: 15_000 })
    await expect(dialog).toBeHidden()

    expect(await loginStatus(request, admin.email, PASSWORD)).toBe(401)
    expect(await loginStatus(request, admin.email, NEW_PASSWORD)).toBe(201)
  } finally {
    await call(request, 'PATCH', `/users/${admin.id}`, { token: t.ADMIN, data: { isActive: false } })
  }
})

// ทดสอบ: ฟอร์มในหน้าเว็บกันกรณีผิดไว้ก่อนยิง API (สั้น / ยาวเกิน 72 / ซ้ำเดิม / ยืนยันไม่ตรง) และกดยกเลิกแล้วรหัสไม่เปลี่ยน
// วิธี: login เป็น ADMIN ใหม่ → เปิดกล่องเปลี่ยนรหัส → กรอกแต่ละกรณีแล้วกดเปลี่ยน → เห็นข้อความผิดตามกรณีและไม่มีคำขอ PATCH /auth/password
//       → กดยกเลิก → กล่องปิด → login ด้วยรหัสเดิมยังได้ 201 → ปิดบัญชีทิ้ง
test('หน้าเว็บ: ฟอร์มเปลี่ยนรหัสกันกรณีผิดก่อนส่ง และยกเลิกแล้วรหัสไม่เปลี่ยน', async ({ page, request }) => {
  const t = await tokens(request)
  const admin = await createReadyAdmin(request, t.ADMIN)
  let patches = 0
  page.on('request', (r) => {
    if (r.method() === 'PATCH' && r.url().endsWith('/auth/password')) patches++
  })

  try {
    await page.goto('/login')
    await submitLogin(page, admin.username, PASSWORD)
    await expect(page).toHaveURL(/\/owner\//)
    await page.goto('/owner/users')
    await page.getByRole('button', { name: 'เปลี่ยนรหัสผ่าน' }).click()
    const dialog = page.getByRole('dialog', { name: 'เปลี่ยนรหัสผ่านของฉัน' })

    const cases: [string, string, string][] = [
      ['a'.repeat(7), 'a'.repeat(7), 'รหัสผ่านใหม่อย่างน้อย 8 ตัวอักษร'],
      ['a'.repeat(73), 'a'.repeat(73), 'รหัสผ่านใหม่ยาวได้ไม่เกิน 72 ตัวอักษร'],
      [PASSWORD, PASSWORD, 'รหัสผ่านใหม่ต้องต่างจากรหัสเดิม'],
      [NEW_PASSWORD, `${NEW_PASSWORD}x`, 'รหัสผ่านใหม่สองช่องไม่ตรงกัน'],
    ]
    await dialog.getByLabel(/^รหัสผ่านปัจจุบัน/).fill(PASSWORD)
    for (const [next, confirm, message] of cases) {
      await dialog.getByLabel(/^รหัสผ่านใหม่/).fill(next)
      await dialog.getByLabel('ยืนยันรหัสผ่านใหม่').fill(confirm)
      await dialog.getByRole('button', { name: 'เปลี่ยนรหัสผ่าน' }).click()
      await expect(dialog.getByRole('alert')).toHaveText([message])
    }
    expect(patches).toBe(0)

    await dialog.getByRole('button', { name: 'ยกเลิก' }).click()
    await expect(dialog).toBeHidden()
    expect(await loginStatus(request, admin.email, PASSWORD)).toBe(201)
  } finally {
    await call(request, 'PATCH', `/users/${admin.id}`, { token: t.ADMIN, data: { isActive: false } })
  }
})
