import { test, expect, type APIRequestContext, type Page } from '@playwright/test'
import { API_URL, loginAsCashier, loginAsKitchen, loginViaApi, onlyCallStaffAlertsFrom } from '../helpers'

// ⚠️ ต้องรัน backend จริง + seed data (DB ทดสอบเท่านั้น — สร้างโต๊ะ/ออเดอร์/คำขอเรียกพนักงานจริง)
// เสียงแจ้งเตือนแยกตาม role:
//   แคชเชียร์ (STAFF) — ได้ยินเสียงลูกค้าเรียก + เห็นป๊อปอัป แต่ไม่ได้ยินเสียงออเดอร์ใหม่
//   ครัว (KITCHEN)    — ได้ยินเสียงออเดอร์ใหม่ แต่ไม่ได้ยินเสียงลูกค้าเรียก และไม่เห็นป๊อปอัป
// เสียงสร้างด้วย Web Audio (src/lib/alert-sound.ts) — ดักทุกโน้ตที่เล่นแล้วแยกชนิดจากรูปคลื่น:
//   เรียกพนักงาน = square 660Hz × 3 · ออเดอร์ใหม่ = sine 880/1320Hz × 4
// ใช้ข้อนี้ได้แม้เทสต์อื่นรันพร้อมกัน: ฝั่งที่ "ต้องไม่ได้ยิน" ไม่มีโค้ดเล่นเสียงชนิดนั้นเลย ของใครเข้ามาก็ไม่ร้อง

const SEED_PASSWORD = 'ChangeMe123!'

type Tone = { type: string; freq: number }

/** ติดตั้งก่อนหน้าเว็บโหลด: เก็บ AudioContext ที่สร้าง + ทุกโน้ตที่สั่ง start ไว้ใน window */
async function recordTones(page: Page) {
  await page.addInitScript(() => {
    const w = window as unknown as { __tones: Tone[]; __audio: AudioContext[] }
    w.__tones = []
    w.__audio = []
    const Original = window.AudioContext
    window.AudioContext = class extends Original {
      constructor(options?: AudioContextOptions) {
        super(options)
        w.__audio.push(this)
      }
    }
    const start = OscillatorNode.prototype.start
    OscillatorNode.prototype.start = function (this: OscillatorNode, ...args: Parameters<OscillatorNode['start']>) {
      w.__tones.push({ type: this.type, freq: this.frequency.value })
      return start.apply(this, args)
    }
  })
}

/** โน้ตที่เล่นไปแล้ว แยกเป็นเสียงเรียกพนักงาน / เสียงออเดอร์ */
async function heard(page: Page) {
  const tones = await page.evaluate(() => (window as unknown as { __tones: Tone[] }).__tones)
  return {
    call: tones.filter((t) => t.type === 'square' && t.freq === 660).length,
    order: tones.filter((t) => t.type === 'sine' && (t.freq === 880 || t.freq === 1320)).length,
  }
}

/** เบราว์เซอร์ไม่ให้เล่นเสียงจนกว่าจะแตะจอ — คลิกหัวข้อ (ไม่มีปุ่ม) แล้วรอให้ AudioContext เริ่มทำงาน */
async function unlockSound(page: Page) {
  await page.getByRole('heading').first().click()
  await expect
    .poll(() =>
      page.evaluate(() => (window as unknown as { __audio: AudioContext[] }).__audio.some((c) => c.state === 'running')),
    )
    .toBe(true)
}

/** สร้างโต๊ะใหม่ + เปิด QR ผ่าน API (ไม่ไปแย่งโต๊ะ seed กับเทสต์อื่น) */
async function openFreshTable(request: APIRequestContext) {
  const admin = await loginViaApi(request, 'admin', SEED_PASSWORD)
  const headers = { Authorization: `Bearer ${admin.accessToken}` }
  const table = await (
    await request.post(`${API_URL}/tables`, {
      headers,
      data: { number: 500 + Math.floor(Math.random() * 9_000_000), seats: 2 },
    })
  ).json()
  const session = await (
    await request.post(`${API_URL}/table-sessions`, { headers, data: { tableId: table.id } })
  ).json()
  return { tableName: String(table.number), token: session.token as string }
}

/** ลูกค้าสั่งน้ำเปล่า 1 ขวด — คืนเลขอ้างอิงออเดอร์ที่โชว์บนตั๋วครัว */
async function customerOrders(request: APIRequestContext, token: string) {
  // เทสอื่นปิดขายน้ำเปล่าชั่วคราวได้ (public-qr / qr-order-flow) — รอให้กลับมาขายก่อน
  let water: { id: string } | undefined
  await expect
    .poll(
      async () => {
        const menu = await (await request.get(`${API_URL}/public/menu`)).json()
        water = menu
          .flatMap((c: { menuItems: { id: string; name: string }[] }) => c.menuItems)
          .find((m: { name: string }) => m.name === 'น้ำเปล่า')
        return Boolean(water)
      },
      { timeout: 15_000 },
    )
    .toBe(true)
  const res = await request.post(`${API_URL}/public/orders`, {
    data: { sessionToken: token, items: [{ menuItemId: water!.id, quantity: 1 }] },
  })
  if (!res.ok()) throw new Error(`สร้างออเดอร์ทดสอบไม่สำเร็จ ${res.status()} ${await res.text()}`)
  const order = await res.json()
  return (order.id as string).slice(0, 6).toUpperCase()
}

async function customerCallsStaff(request: APIRequestContext, token: string) {
  const res = await request.post(`${API_URL}/public/call-staff`, { data: { sessionToken: token } })
  if (!res.ok()) throw new Error(`เรียกพนักงานไม่สำเร็จ ${res.status()} ${await res.text()}`)
}

/** เปิดหน้าแล้วรอข้อมูลรอบแรกโหลดเสร็จ — ของที่มีอยู่ตอนโหลดครั้งแรกไม่ร้อง (useNewArrivals) จึงต้องสร้างของใหม่หลังจากนี้ */
async function openAndWaitFor(page: Page, path: string, apiPath: string) {
  await Promise.all([
    page.waitForResponse(
      (res) => new URL(res.url()).pathname === apiPath && res.request().method() === 'GET' && res.ok(),
    ),
    page.goto(path),
  ])
}

// ทดสอบ: แคชเชียร์ได้ยินเสียงลูกค้าเรียกและเห็นป๊อปอัปของโต๊ะนั้น แต่ไม่ได้ยินเสียงออเดอร์ใหม่
// วิธี: ดักโน้ต Web Audio ก่อนหน้าโหลด + ให้หน้าเห็นเฉพาะคำขอของโต๊ะนี้ → login STAFF เปิดหน้า Check รอโหลดคำขอรอบแรก → แตะจอปลดล็อกเสียง
//       → ลูกค้าสั่งอาหารก่อน แล้วค่อยกดเรียกพนักงาน → รอป๊อปอัปของโต๊ะนี้ขึ้น + ได้ยินปี๊บเรียก
//       → รอต่ออีกนิดให้ออเดอร์ (ที่ส่งก่อนคำขอ) มีเวลาไปถึงแน่ ๆ → ต้องไม่มีเสียงติ๊งต่องออเดอร์
test('แคชเชียร์: ได้ยินเสียงลูกค้าเรียก + ขึ้นป๊อปอัป แต่ไม่ได้ยินเสียงสั่งอาหาร', async ({ page, request }) => {
  const { tableName, token } = await openFreshTable(request)
  await recordTones(page)
  await onlyCallStaffAlertsFrom(page, tableName)
  await loginAsCashier(page, request)
  await openAndWaitFor(page, '/employee/check', '/service-requests')
  await unlockSound(page)

  await customerOrders(request, token)
  await customerCallsStaff(request, token)

  // หน้านี้เห็นเฉพาะคำขอของโต๊ะนี้ (onlyCallStaffAlertsFrom) — ไม่ต้องไปกดรับทราบของโต๊ะอื่น
  const alert = page.getByRole('alert').filter({ hasText: `โต๊ะ ${tableName}` })
  await expect(alert).toBeVisible({ timeout: 10_000 })

  await expect.poll(async () => (await heard(page)).call, { message: 'ต้องได้ยินเสียงลูกค้าเรียก' }).toBeGreaterThan(0)
  await page.waitForTimeout(2000)
  expect((await heard(page)).order, 'แคชเชียร์ต้องไม่ได้ยินเสียงสั่งอาหาร').toBe(0)

  await alert.getByRole('button', { name: 'รับทราบ' }).click()
  await expect(alert).toHaveCount(0)
})

// ทดสอบ: ครัวได้ยินเสียงออเดอร์ใหม่ แต่ไม่ได้ยินเสียงลูกค้าเรียก และไม่มีป๊อปอัปเรียกพนักงาน
// วิธี: ดักโน้ต Web Audio ก่อนหน้าโหลด → login KITCHEN เปิดบอร์ดครัว รอโหลดออเดอร์รอบแรก → แตะจอปลดล็อกเสียง
//       → ลูกค้ากดเรียกพนักงานก่อน แล้วค่อยสั่งอาหาร → รอตั๋วของออเดอร์นี้ขึ้นในคอลัมน์รอคิว + ได้ยินติ๊งต่อง
//       → รอต่ออีกนิด → ต้องไม่มีเสียงปี๊บเรียกพนักงาน และไม่มีป๊อปอัป "มีการเรียกพนักงาน"
test('ครัว: ได้ยินเสียงสั่งอาหาร แต่ไม่ได้ยินเสียงลูกค้าเรียก', async ({ page, request }) => {
  const { token } = await openFreshTable(request)
  await recordTones(page)
  await loginAsKitchen(page, request)
  await openAndWaitFor(page, '/employee/order', '/orders')
  await expect(page.getByRole('heading', { name: 'รอคิว' })).toBeVisible()
  await unlockSound(page)

  await customerCallsStaff(request, token)
  const orderRef = await customerOrders(request, token)

  const queue = page.getByRole('region', { name: 'รอคิว', exact: true })
  await expect(queue.locator('article', { hasText: `#${orderRef}` })).toBeVisible({ timeout: 10_000 })
  await expect.poll(async () => (await heard(page)).order, { message: 'ต้องได้ยินเสียงสั่งอาหาร' }).toBeGreaterThan(0)

  await page.waitForTimeout(2000)
  expect((await heard(page)).call, 'ครัวต้องไม่ได้ยินเสียงลูกค้าเรียก').toBe(0)
  await expect(page.getByRole('alert').filter({ hasText: 'มีการเรียกพนักงาน' })).toHaveCount(0)
})

// ทดสอบ: ครัวกดปิดเสียงที่หัวจอแล้ว ออเดอร์ใหม่ต้องไม่ร้อง (ตั๋วยังขึ้นตามปกติ) และค่าปิดเสียงจำไว้ในเครื่องนี้ แม้ refresh
// วิธี: ดักโน้ต Web Audio ก่อนหน้าโหลด → login KITCHEN เปิดบอร์ดครัว รอโหลดรอบแรก → แตะจอปลดล็อกเสียง → กดปุ่มเสียง (เปิดอยู่ → ปิด) เช็ก aria-pressed
//       → จดจำนวนโน้ตที่ได้ยินไปแล้ว → ลูกค้าสั่งอาหาร → รอตั๋วขึ้นในคอลัมน์รอคิว → รอต่ออีกนิด เช็กว่าไม่มีโน้ตเสียงออเดอร์เพิ่ม → reload เช็กว่าปุ่มยังเป็น "ปิดอยู่"
test('ครัว: กดปิดเสียงแล้วออเดอร์ใหม่ไม่ร้อง (ตั๋วยังขึ้น) และ refresh แล้วยังปิดอยู่', async ({ page, request }) => {
  const { token } = await openFreshTable(request)
  await recordTones(page)
  await loginAsKitchen(page, request)
  await openAndWaitFor(page, '/employee/order', '/orders')
  await unlockSound(page)

  await page.getByRole('button', { name: 'เสียงแจ้งเตือนเปิดอยู่ (แตะเพื่อปิด)' }).click()
  const muted = page.getByRole('button', { name: 'เสียงแจ้งเตือนปิดอยู่ (แตะเพื่อเปิด)' })
  await expect(muted).toHaveAttribute('aria-pressed', 'false')
  // นับเฉพาะเสียงหลังกดปิด — ออเดอร์ของเทสต์อื่นที่เข้ามาก่อนกดปิดร้องได้ตามปกติ
  const before = (await heard(page)).order

  const orderRef = await customerOrders(request, token)
  const queue = page.getByRole('region', { name: 'รอคิว', exact: true })
  await expect(queue.locator('article', { hasText: `#${orderRef}` })).toBeVisible({ timeout: 10_000 })
  await page.waitForTimeout(2000)
  expect((await heard(page)).order - before, 'ปิดเสียงแล้วต้องไม่มีเสียงออเดอร์').toBe(0)

  await page.reload()
  await expect(muted).toBeVisible()
})

// ทดสอบ: แคชเชียร์กดปิดเสียงที่หัวจอหน้า Check ได้ (เดิมปุ่มอยู่แต่บนจอครัว) — ลูกค้าเรียกแล้วป๊อปอัปยังขึ้นแต่ไม่ร้อง และ refresh แล้วยังปิดอยู่
// วิธี: ดักโน้ต Web Audio + ให้หน้าเห็นเฉพาะคำขอของโต๊ะนี้ → login STAFF เปิดหน้า Check รอโหลดคำขอรอบแรก → แตะจอปลดล็อกเสียง → กดปุ่มเสียงที่หัวจอ (เปิดอยู่ → ปิด)
//       → จดจำนวนโน้ตเสียงเรียกที่ได้ยินไปแล้ว → ลูกค้ากดเรียกพนักงาน → รอป๊อปอัปของโต๊ะนี้ → รอต่ออีกนิด เช็กว่าไม่มีเสียงเรียกเพิ่ม → reload เช็กว่าปุ่มยังเป็น "ปิดอยู่"
test('แคชเชียร์: ปิดเสียงที่หัวจอ → ลูกค้าเรียกแล้วป๊อปอัปขึ้นแต่ไม่ร้อง และ refresh แล้วยังปิดอยู่', async ({ page, request }) => {
  const { tableName, token } = await openFreshTable(request)
  await recordTones(page)
  await onlyCallStaffAlertsFrom(page, tableName)
  await loginAsCashier(page, request)
  await openAndWaitFor(page, '/employee/check', '/service-requests')
  await unlockSound(page)

  await page.getByRole('button', { name: 'เสียงแจ้งเตือนเปิดอยู่ (แตะเพื่อปิด)' }).click()
  const muted = page.getByRole('button', { name: 'เสียงแจ้งเตือนปิดอยู่ (แตะเพื่อเปิด)' })
  await expect(muted).toHaveAttribute('aria-pressed', 'false')
  const before = (await heard(page)).call

  await customerCallsStaff(request, token)
  await expect(page.getByRole('alert').filter({ hasText: `โต๊ะ ${tableName}` })).toBeVisible({ timeout: 10_000 })
  await page.waitForTimeout(2000)
  expect((await heard(page)).call - before, 'ปิดเสียงแล้วต้องไม่มีเสียงเรียกพนักงาน').toBe(0)

  await page.reload()
  await expect(muted).toBeVisible()
})
