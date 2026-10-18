import { expect, type APIRequestContext, type Page } from '@playwright/test'

const API_URL = 'http://localhost:3000'
const LOGIN_EMAIL_DOMAIN = 'restaurant.local'

/** กรอกฟอร์ม login แล้วกดส่ง — ใช้ร่วมกันทุกเคสที่ต้อง submit จริง */
export async function submitLogin(page: Page, username: string, password: string) {
  await page.getByLabel('ผู้ใช้').fill(username)
  await page.getByLabel('รหัสผ่าน').fill(password)
  await page.getByRole('button', { name: 'เข้าสู่ระบบ' }).click()
}

/**
 * login ตรงกับ backend จริง (ไม่ผ่าน UI) เอาไว้ setup "login อยู่แล้ว" แบบเร็ว ๆ
 * ต้องใช้ token จริงเท่านั้น เพราะ apiClient (src/lib/api-client.ts) จะเช็ค 401
 * กับทุก request — ถ้าใช้ token ปลอม หน้าที่ยิง API จริงจะโดนเด้งกลับไป login ทันที
 */
export async function loginViaApi(
  request: APIRequestContext,
  username: string,
  password: string,
) {
  const email = username.includes('@') ? username : `${username}@${LOGIN_EMAIL_DOMAIN}`
  const res = await request.post(`${API_URL}/auth/login`, {
    data: { email, password },
  })
  if (!res.ok()) {
    throw new Error(`login ผ่าน API ไม่สำเร็จ (${res.status()}) — เช็คว่า backend รันอยู่และ seed ข้อมูลแล้ว`)
  }
  return (await res.json()) as {
    accessToken: string
    user: { id: string; email: string; name: string; role: 'ADMIN' | 'STAFF' | 'KITCHEN' }
  }
}

/** ยัด auth state (token + user จริงจาก loginViaApi) ลง localStorage ตรง ๆ ตาม src/lib/auth-storage.ts */
export async function setAuthState(
  page: Page,
  accessToken: string,
  user: { id: string; email: string; name: string; role: 'ADMIN' | 'STAFF' | 'KITCHEN' },
) {
  await page.evaluate(
    ([token, u]) => {
      localStorage.setItem('restaurant.token', token as string)
      localStorage.setItem('restaurant.user', JSON.stringify(u))
    },
    [accessToken, user] as const,
  )
}

/** login เป็น admin จริงผ่าน API แล้วยัด token ลง localStorage — ใช้ setup ก่อนทุกเทสที่ต้อง login เป็น admin */
export async function loginAsAdmin(page: Page, request: APIRequestContext) {
  const { accessToken, user } = await loginViaApi(request, 'admin', 'ChangeMe123!')
  await page.goto('/login')
  await setAuthState(page, accessToken, user)
  return user
}

/** login เป็น STAFF จริง — ใช้เทียบว่าหน้าที่ ADMIN เท่านั้นเข้าได้ จะกัน STAFF ออกจริง */
// 23 ก.ย. รวม CASHIER + WAITER เป็น STAFF แล้ว — seed เหลือบัญชี staff@ บัญชีเดียว
export async function loginAsStaff(page: Page, request: APIRequestContext) {
  const { accessToken, user } = await loginViaApi(request, 'staff', 'ChangeMe123!')
  await page.goto('/login')
  await setAuthState(page, accessToken, user)
  return user
}

/** login เป็น cashier (STAFF) จริง — ใช้ทดสอบฝั่ง Check / เปิดโต๊ะ */
export async function loginAsCashier(page: Page, request: APIRequestContext) {
  const { accessToken, user } = await loginViaApi(request, 'staff', 'ChangeMe123!')
  await page.goto('/login')
  await setAuthState(page, accessToken, user)
  return user
}

/** login เป็น KITCHEN จริง — ใช้ทดสอบหน้า Order (คิวครัว) */
export async function loginAsKitchen(page: Page, request: APIRequestContext) {
  const { accessToken, user } = await loginViaApi(request, 'kitchen', 'ChangeMe123!')
  await page.goto('/login')
  await setAuthState(page, accessToken, user)
  return user
}

/**
 * เปิดโต๊ะแรกที่ว่าง แล้วรับออเดอร์แทนลูกค้า 1 รายการผ่าน "รับออเดอร์แทนลูกค้า" (TakeOrderDialog)
 * ใช้เป็น setup ร่วมของเทสที่ต้องมีออเดอร์จริงอยู่ในระบบก่อน (เช่น ปิดโต๊ะที่มีออเดอร์ค้าง, flow ของครัว)
 *
 * คืน orderRef กลับมาด้วยเพื่อใช้หา <article> ของออเดอร์นี้แบบเจาะจง (จาก POST /orders response โดยตรง)
 * เพราะถ้า match ด้วยแค่ชื่อโต๊ะ จะชนกับออเดอร์เก่าที่อาจค้างจากการรันเทสไฟล์อื่นในโต๊ะเดียวกัน
 * (สูตรคำนวณ ref ตรงกับ src/lib/map.ts: orderRef = id.slice(0, 6).toUpperCase())
 */
export async function openTableAndPlaceOrder(
  page: Page,
  menuItemPattern: string | RegExp,
): Promise<{ tableCardText: string; orderRef: string }> {
  await page.goto('/employee/tables')

  const availableTable = page.locator('article', { hasText: 'ว่าง' }).first()
  await expect(availableTable).toBeVisible()
  const tableCardText = (await availableTable.locator('p.text-xl').innerText()).trim()

  await availableTable.getByRole('button', { name: 'เปิดโต๊ะ + สร้าง QR' }).click()
  await page.keyboard.press('Escape') // ปิด QR dialog ที่เด้งขึ้นมาเองหลังเปิดโต๊ะสำเร็จ

  const openedTable = page.locator('article', { hasText: tableCardText })
  await openedTable.getByRole('button', { name: 'รับออเดอร์แทนลูกค้า' }).click()

  // TakeOrderDialog: กด "+ เพิ่ม" ที่เมนู → ได้บรรทัดใหม่ด้านล่าง (เลือกตัวเลือก/จำนวน/หมายเหตุรายบรรทัด)
  const orderDialog = page.getByRole('dialog')
  await orderDialog
    .getByRole('listitem')
    .filter({ hasText: menuItemPattern })
    .first()
    .getByRole('button', { name: '+ เพิ่ม' })
    .click()

  // เมนูที่มีกลุ่ม "เนื้อสัตว์" บังคับเลือก (ปุ่มส่งเข้าครัวจะกดไม่ได้ถ้ายังไม่เลือก)
  // เลือก "หมู" (+0 บาท) ไว้ ราคาจะได้เท่าราคาเมนูพอดี
  const pork = orderDialog.getByRole('button', { name: 'หมู', exact: true })
  if (await pork.count()) await pork.last().click()

  const [response] = await Promise.all([
    page.waitForResponse(
      (res) => res.url().endsWith('/orders') && res.request().method() === 'POST',
    ),
    orderDialog.getByRole('button', { name: 'ส่งเข้าครัว' }).click(),
  ])
  const created = (await response.json()) as { id: string }
  const orderRef = created.id.slice(0, 6).toUpperCase()

  await expect(orderDialog).not.toBeVisible()

  return { tableCardText, orderRef }
}

/**
 * ไล่สถานะออเดอร์จาก "รอคิว" ไปจนถึง "เสิร์ฟแล้ว" (SERVED) ที่หน้า Order
 * ต้อง login เป็น ADMIN หรือ KITCHEN เท่านั้น (pageRoles.order) ถึงจะเข้าหน้านี้ได้
 *
 * จำเป็นสำหรับเทสที่เกี่ยวกับการเก็บเงิน เพราะ backend/CheckPage.tsx ไม่ให้กดเก็บเงิน
 * จนกว่าออเดอร์ทุกใบในโต๊ะจะถูกเสิร์ฟก่อน (ดู CheckPage.tsx: notServed.length > 0 = blocked)
 */
export async function advanceOrderToServed(page: Page, orderRef: string) {
  await page.goto('/employee/order')

  const cardText = `#${orderRef}`
  const queueColumn = page.locator('section', { hasText: 'รอคิว' })
  const cookingColumn = page.locator('section', { hasText: 'กำลังปรุง' })

  await queueColumn
    .locator('article', { hasText: cardText })
    .getByRole('button', { name: 'เริ่มปรุง' })
    .click()

  const inCooking = cookingColumn.locator('article', { hasText: cardText })
  await expect(inCooking).toBeVisible()
  await inCooking.getByRole('button', { name: 'ทำเสร็จแล้ว' }).click()
}
