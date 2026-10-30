import { randomInt } from 'node:crypto'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { QRCodeSVG } from 'qrcode.react'
import { expect, type APIRequestContext, type Locator, type Page } from '@playwright/test'

// ชี้ API อื่นได้ด้วย E2E_API_URL (เช่น API ทดสอบที่ต่อ DB restaurant_test)
export const API_URL = process.env.E2E_API_URL ?? 'http://localhost:3000'
const LOGIN_EMAIL_DOMAIN = 'restaurant.local'

/** กรอกฟอร์ม login แล้วกดส่ง — ใช้ร่วมกันทุกเคสที่ต้อง submit จริง */
export async function submitLogin(page: Page, username: string, password: string) {
  await page.getByLabel('Username').fill(username)
  await page.getByLabel('Password').fill(password)
  await page.getByRole('button', { name: 'Login' }).click()
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

/**
 * ยัด auth state (token + user จริงจาก loginViaApi) ตรง ๆ แทนการกรอกฟอร์ม
 * token อยู่ใน httpOnly cookie `restaurant_token` แบบที่ backend ตั้งให้ (src/auth/auth-cookie.ts)
 * ส่วน user อยู่ใน localStorage ตาม src/lib/auth-storage.ts
 * cookie ผูกกับ host ของ API — localhost ไม่สนพอร์ต หน้าเว็บกับ page.request จึงส่ง cookie ไปเองทั้งคู่
 */
export async function setAuthState(
  page: Page,
  accessToken: string,
  user: { id: string; email: string; name: string; role: 'ADMIN' | 'STAFF' | 'KITCHEN' },
) {
  await page.context().addCookies([{ name: 'restaurant_token', value: accessToken, url: API_URL }])
  await page.evaluate((u) => localStorage.setItem('restaurant.user', JSON.stringify(u)), user)
}

/** login เป็น admin จริงผ่าน API แล้วยัด auth state ลงหน้า — ใช้ setup ก่อนทุกเทสที่ต้อง login เป็น admin */
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

/** login เป็น cashier (STAFF) จริง — ใช้ทดสอบฝั่ง Check / เปิดโต๊ะ (บัญชีเดียวกับ loginAsStaff) */
export const loginAsCashier = loginAsStaff

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
): Promise<{ tableCardText: string; orderRef: string; orderId: string }> {
  await page.goto('/employee/tables')

  // หลาย worker สุ่มโต๊ะว่างพร้อมกันอาจได้ตัวเดียวกัน ("มี QR session ที่เปิดอยู่แล้ว") — สุ่มใหม่ได้ 3 รอบ
  const qrDialog = page.getByRole('dialog', { name: /^QR โต๊ะ/ })
  const taken = page.getByRole('alert').filter({ hasText: 'มี QR session ที่เปิดอยู่แล้ว' })
  let tableCardText = ''
  for (let attempt = 0; attempt < 3; attempt++) {
    tableCardText = await pickFreeTable(page)
    const panel = await selectTable(page, tableCardText)
    await panel.getByRole('button', { name: 'เปิดโต๊ะ/สร้าง QR' }).click()
    await expect(qrDialog.or(taken)).toBeVisible()
    if (await qrDialog.isVisible()) break
    await page.reload()
  }
  // ปิด QR dialog ที่เด้งขึ้นมาเองหลังเปิดโต๊ะสำเร็จ — รอให้ขึ้นก่อน ไม่งั้น Escape ไปก่อน dialog (ตอนไม่มี slowMo)
  await expect(qrDialog).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(qrDialog).toHaveCount(0)

  // แผงรายละเอียดยังเปิดค้างโต๊ะเดิมหลังเปิดโต๊ะ — ปุ่มรับออเดอร์อยู่ในแผงนั้น
  await tablesPageCard(page, tableCardText).getByRole('button', { name: 'รับออเดอร์แทนลูกค้า' }).click()

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

  return { tableCardText, orderRef, orderId: created.id }
}

/**
 * สุ่มโต๊ะว่าง 1 ตัวในหน้า /employee/tables แล้วคืนหัวการ์ด ("โต๊ะ 7")
 * หลาย worker เปิดโต๊ะพร้อมกัน — เลือกตัวแรกเหมือนกันหมดจะชนกัน ("มี QR session ที่เปิดอยู่แล้ว")
 * คืนเป็นชื่อแทน locator: locator แบบ nth/first ประเมินใหม่ทุกครั้ง พอเทสอื่นเปิดโต๊ะไปก่อน จะชี้ไปโต๊ะอื่น
 */
export async function pickFreeTable(page: Page) {
  // ผังโต๊ะ: การ์ดเป็นปุ่มเลือกโต๊ะ — ป้าย "ว่าง" ไม่ซ้ำกับสถานะอื่น (มีลูกค้า/จองแล้ว/ขอเช็คบิล/เรียกพนักงาน)
  const free = page.getByRole('region', { name: 'ผังโต๊ะ' }).getByRole('button').filter({ hasText: 'ว่าง' })
  await expect(free.first()).toBeVisible()
  const pick = free.nth(randomInt(await free.count()))
  // ตัวเลขใหญ่บนการ์ด = "โต๊ะ " (sr-only) + เลขโต๊ะ
  return ((await pick.locator('span').first().textContent()) ?? '').trim()
}

/**
 * ไล่สถานะออเดอร์จาก "รอคิว" ไปจนถึง "เสิร์ฟแล้ว" (SERVED) — orderId มาจาก openTableAndPlaceOrder
 * page ต้อง login เป็น ADMIN หรือ KITCHEN อยู่ (สิทธิ์เปลี่ยนสถานะออเดอร์)
 *
 * จำเป็นสำหรับเทสที่เกี่ยวกับการเก็บเงิน เพราะ backend/CheckPage.tsx ไม่ให้กดเก็บเงิน
 * จนกว่าออเดอร์ทุกใบในโต๊ะจะถูกเสิร์ฟก่อน (ดู CheckPage.tsx: notServed.length > 0 = blocked)
 */
export async function advanceOrderToServed(page: Page, orderId: string) {
  // ไล่สถานะผ่าน API ด้วย cookie ของคนที่ login อยู่ (ADMIN) — page.request ใช้ cookie ชุดเดียวกับหน้า
  // helper นี้แค่เตรียมสถานะให้เทสต์หน้าแคชเชียร์
  // เดิมกดผ่านจอครัว: ตั๋วสะสมเยอะ + ป๊อปอัป "เรียกพนักงาน" จากเทสต์อื่นที่รันพร้อมกัน ทำให้หมดเวลาเป็นพัก ๆ
  // ขั้นตอนบนจอครัวจริงเทสต์แยกที่ test/e2e/kitchen/kitchen-flow.spec.ts
  for (const status of ['PREPARING', 'SERVED']) {
    const res = await page.request.patch(`${API_URL}/orders/${orderId}/status`, { data: { status } })
    expect(res.ok(), `เปลี่ยนสถานะออเดอร์เป็น ${status} ไม่สำเร็จ (${res.status()})`).toBe(true)
  }
}

/**
 * การ์ดโต๊ะที่เปิดอยู่ในหน้า Check (เดิมเป็นแถวในตาราง) — หาจากหัวการ์ด "โต๊ะ {name}"
 * หน้า Check มี <article> เฉพาะการ์ดโต๊ะ ส่วนบิลที่เก็บแล้วยังเป็นตาราง
 */
export function checkTableTile(page: Page, tableName: string) {
  return page
    .locator('article')
    .filter({ has: page.getByRole('heading', { name: `โต๊ะ ${tableName}`, exact: true }) })
}

/**
 * การ์ดโต๊ะในผังโต๊ะ (/employee/tables) — ชื่อปุ่มขึ้นต้นด้วย "โต๊ะ N" ตามด้วยสถานะ
 * (?!\d): 'โต๊ะ 1' ต้องไม่ไปชน 'โต๊ะ 10', 'โต๊ะ 11' เมื่อร้านมีโต๊ะเกิน 9 ตัว
 */
export function tablesTile(page: Page, tableCardText: string) {
  const escaped = tableCardText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return page
    .getByRole('region', { name: 'ผังโต๊ะ' })
    .getByRole('button', { name: new RegExp(`^${escaped}(?!\\d)`) })
}

/**
 * แผงรายละเอียดของโต๊ะที่เลือกอยู่ (ปุ่มเปิดโต๊ะ/รับออเดอร์/ดู QR/ปิดโต๊ะ อยู่ในนี้)
 * ต้องแตะการ์ดก่อนด้วย selectTable — แผงค้างโต๊ะเดิมไว้จนกว่าจะเลือกโต๊ะอื่นหรือโหลดหน้าใหม่
 */
export function tablesPageCard(page: Page, tableCardText: string) {
  return page.getByRole('region', { name: tableCardText, exact: true })
}

/** แตะการ์ดโต๊ะในผัง แล้วคืนแผงรายละเอียดของโต๊ะนั้น */
export async function selectTable(page: Page, tableCardText: string) {
  await tablesTile(page, tableCardText).click()
  const panel = tablesPageCard(page, tableCardText)
  await expect(panel).toBeVisible()
  return panel
}

/**
 * แทน window.print ด้วยฟังก์ชันเปล่าก่อนหน้าโหลด — ใบเสร็จ PromptPay สั่งพิมพ์เองทันที
 * กล่องพิมพ์จริงของเบราว์เซอร์ทดสอบไม่ได้ (และอาจค้างรอ) เรียกก่อน page.goto
 */
export async function stubPrint(page: Page) {
  await page.addInitScript(() => {
    window.print = () => {}
  })
}

/**
 * PromptPay แบบพิมพ์ใบเสร็จก่อน: กด "พิมพ์ใบเสร็จ" ในกล่องรับเงิน → บิลบันทึกเป็น "รอสลิป"
 * ใบเสร็จ (มี QR) สั่งพิมพ์เอง แล้วกล่อง "ตรวจสลิป" ของบิลนั้นเด้งขึ้นมาเอง — คืนกล่องนั้นพร้อมเลขใบเสร็จ
 * ต้อง stubPrint ก่อนเปิดหน้า
 */
export async function printPromptPay(page: Page, payDialog: Locator) {
  await payDialog.getByRole('button', { name: 'พิมพ์ใบเสร็จ', exact: true }).click()
  const slipDialog = page.getByRole('dialog', { name: 'ตรวจสลิป' })
  await expect(slipDialog).toBeVisible()
  const receiptNo = (await slipDialog.getByText(/^RCPT-/).innerText()).trim()
  return { slipDialog, receiptNo }
}

/**
 * ลูกค้า: "เพิ่มรายการ" พากลับหน้าเมนูแล้ว (ไม่ไปตะกร้า) — เปิดตะกร้าจากแท็บ "รายการที่เลือก"
 * มีทั้งแถบล่าง (มือถือ) และแถบบน (จอใหญ่) ตัวที่ซ่อนอยู่ไม่นับเป็น role จึงได้ตัวที่เห็นเสมอ
 */
export async function openCart(page: Page) {
  await page.getByRole('link', { name: /^รายการที่เลือก/ }).click()
  await expect(page).toHaveURL(/\/cart$/)
}

/**
 * เลือกตัวเลือกเมนูในหน้าลูกค้า (เนื้อสัตว์ = radio, เพิ่มเติม = checkbox)
 * input จริงซ่อนไว้ (sr-only) แล้ววาดปุ่มเองทับ — .check() จะกดไม่โดนเพราะมีของบังอยู่
 * จึงกดที่แถว <label> แบบที่ลูกค้ากดจริง แล้วเช็กว่าถูกเลือกแล้ว
 */
export async function chooseOption(page: Page, role: 'radio' | 'checkbox', name: string | RegExp) {
  const input = page.getByRole(role, { name })
  await page.locator('label').filter({ has: input }).click()
  await expect(input).toBeChecked()
}

/** ตาราง "บิลที่เก็บแล้ววันนี้" ในหน้า Check (section มี aria-labelledby จึงเป็น region) */
export function paidBillsTable(page: Page) {
  return page.getByRole('region', { name: /บิลที่เก็บแล้ววันนี้/ }).locator('table')
}

/**
 * รูป PNG ของสลิป (จำลอง) — มี QR ที่เข้ารหัส text ไว้ ใช้แนบที่ปุ่ม "แนบรูป" หน้ารับเงิน
 * วาด QR ด้วย qrcode.react ตัวเดียวกับหน้าเว็บ แล้วแคปจากหน้าเปล่าใน context เดียวกับ page
 * text = null → รูปขาวล้วนไม่มี QR (เคส "ไม่พบ QR ในรูป")
 */
export async function slipImage(page: Page, text: string | null) {
  const body = text
    ? renderToStaticMarkup(createElement(QRCodeSVG, { value: text, size: 320, marginSize: 4 }))
    : '<div style="width:320px;height:320px;background:#fff"></div>'
  const canvas = await page.context().newPage()
  try {
    await canvas.setContent(`<body style="margin:0;background:#fff"><div id="slip" style="display:inline-block;padding:24px;background:#fff">${body}</div></body>`)
    const buffer = await canvas.locator('#slip').screenshot()
    return { name: 'slip.png', mimeType: 'image/png', buffer }
  } finally {
    await canvas.close()
  }
}

/**
 * ป๊อปอัป "มีการเรียกพนักงาน" ในหน้านี้ ให้เห็นเฉพาะคำขอของโต๊ะที่ระบุ (ไม่ระบุ = ไม่เห็นเลย)
 * กรอง response ของ GET /service-requests จาก backend จริง — ทั้งชุดรันขนานกัน คำขอของโต๊ะอื่นเข้ามาตลอด
 * ป๊อปอัปโชว์ทีละใบ (เก่าสุดก่อน) จึงบังของโต๊ะตัวเอง หรือลอยทับปุ่มแถวล่าง ๆ ในเทสต์ที่ไม่เกี่ยว
 * ห้ามกด "รับทราบ" ของโต๊ะอื่นแทน — เป็นการปิดคำขอจริงใน DB ทำให้เทสต์อื่นที่รอป๊อปอัปของโต๊ะตัวเองพัง
 */
export async function onlyCallStaffAlertsFrom(page: Page, tableNumber?: string | number) {
  const origin = new URL(API_URL).origin
  await page.route(
    (url) => url.origin === origin && url.pathname === '/service-requests',
    async (route) => {
      if (route.request().method() !== 'GET') return route.continue()
      if (tableNumber === undefined) return route.fulfill({ json: [] })
      // เทสต์จบ/หน้าปิดระหว่างที่ request ยังค้าง → fetch โยน error ออกไปโผล่ในเทสต์ถัดไปของ worker เดียวกัน — ไม่ต้องสนใจ
      try {
        const res = await route.fetch()
        const all = (await res.json()) as { table?: { number: number } }[]
        await route.fulfill({ response: res, json: all.filter((r) => String(r.table?.number) === String(tableNumber)) })
      } catch {
        // หน้าปิดไปแล้ว
      }
    },
  )
}

/** ซ่อนป๊อปอัป "มีการเรียกพนักงาน" ทั้งหมดในหน้านี้ (เทสต์ที่ไม่เกี่ยวกับการเรียกพนักงาน) */
export const hideCallStaffAlerts = (page: Page) => onlyCallStaffAlertsFrom(page)
