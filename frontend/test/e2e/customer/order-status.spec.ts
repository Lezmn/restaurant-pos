import { test, expect, type Page } from '@playwright/test'
import { call, customerOrder, menuItemByName, ok, openNewSession, tokens } from '../api/api-helpers'

// ⚠️ ต้องรัน backend จริง + seed data (DB ทดสอบเท่านั้น — สร้างโต๊ะ/ออเดอร์จริง)
// หน้าติดตามสถานะของลูกค้า (/t/:token/status): สถานะต้องเดินตามที่ครัวกด โดยลูกค้าไม่ต้องรีเฟรชเอง

// หน้าลูกค้าดึงออเดอร์ใหม่ทุก 10 วิ (ORDER_POLL_MS) + socket — เผื่อเวลาให้รอบดึงถัดไปมาถึง
const LIVE = { timeout: 20_000 }

const currentStep = (page: Page) => page.locator('li[aria-current="step"]')
const eta = (page: Page) => page.getByText('คาดว่าจะได้รับในอีก')

// ทดสอบ: ลูกค้าเห็นสถานะออเดอร์เปลี่ยนเอง รับออเดอร์แล้ว → กำลังปรุงอาหาร → เสิร์ฟแล้ว และเวลารอหายไปเมื่อเสิร์ฟ
// วิธี: เปิดโต๊ะใหม่ สั่งน้ำผ่าน QR → ลูกค้าเปิดหน้าสถานะบนมือถือ → ครัวเปลี่ยนสถานะผ่าน API ทีละขั้น
//       → เช็กขั้นที่ aria-current="step" บนจอลูกค้า (ไม่กดรีเฟรช) และว่ามี/ไม่มี "คาดว่าจะได้รับในอีก"
test('ลูกค้าเห็นสถานะออเดอร์เดินตามครัว: รับออเดอร์แล้ว → กำลังปรุง → เสิร์ฟแล้ว', async ({ browser, request }) => {
  const t = await tokens(request)
  const { table, session } = await openNewSession(request, t)
  const water = await menuItemByName(request, 'น้ำเปล่า')
  const order = await customerOrder(request, session.token, [{ menuItemId: water.id, quantity: 2 }])

  const customer = await (await browser.newContext({ viewport: { width: 375, height: 812 } })).newPage()
  await customer.goto(`/t/${session.token}/status`)
  await expect(customer.getByRole('heading', { name: 'ติดตามสถานะออเดอร์' })).toBeVisible()
  await expect(customer.getByText(`โต๊ะ ${table.number} : ทั้งหมด 1 รายการ`)).toBeVisible()
  await expect(customer.getByText('2× น้ำเปล่า')).toBeVisible()

  await test.step('ยังไม่เริ่มปรุง → รับออเดอร์แล้ว + บอกเวลารอ', async () => {
    await expect(currentStep(customer)).toHaveText(/รับออเดอร์แล้ว/)
    await expect(eta(customer)).toBeVisible()
  })

  await test.step('ครัวเริ่มปรุง → กำลังปรุงอาหาร', async () => {
    await ok(await call(request, 'PATCH', `/orders/${order.id}/status`, { token: t.KITCHEN, data: { status: 'PREPARING' } }))
    await expect(currentStep(customer)).toHaveText(/กำลังปรุงอาหาร/, LIVE)
    await expect(eta(customer)).toBeVisible()
  })

  await test.step('ครัวเสิร์ฟ → เสิร์ฟแล้ว และไม่บอกเวลารอแล้ว', async () => {
    await ok(await call(request, 'PATCH', `/orders/${order.id}/status`, { token: t.KITCHEN, data: { status: 'SERVED' } }))
    await expect(currentStep(customer)).toHaveText(/เสิร์ฟแล้ว/, LIVE)
    await expect(eta(customer)).toHaveCount(0)
  })

  await customer.context().close()
})

// ทดสอบ: ครัวยกเลิกออเดอร์ → ลูกค้าเห็นแบนเนอร์ยกเลิกและ "ไม่คิดเงิน" เอง ส่วนออเดอร์ใหม่ยังเดินสถานะได้ปกติ
// วิธี: สั่งน้ำ 1 ออเดอร์ → ลูกค้าเปิดหน้าสถานะ → ครัวยกเลิกผ่าน API → เช็กแบนเนอร์ ป้าย "ยกเลิกแล้ว" และไม่มี stepper
//       → สั่งออเดอร์ใหม่ → เช็กว่า stepper กลับมาที่ "รับออเดอร์แล้ว" และแบนเนอร์ของใบเก่ายังอยู่
test('ครัวยกเลิกออเดอร์: ลูกค้าเห็นแบนเนอร์และไม่คิดเงิน ออเดอร์ใหม่ยังติดตามได้', async ({ browser, request }) => {
  const t = await tokens(request)
  const { session } = await openNewSession(request, t)
  const water = await menuItemByName(request, 'น้ำเปล่า')
  const first = await customerOrder(request, session.token, [{ menuItemId: water.id, quantity: 1 }])

  const customer = await (await browser.newContext({ viewport: { width: 375, height: 812 } })).newPage()
  await customer.goto(`/t/${session.token}/status`)
  await expect(currentStep(customer)).toHaveText(/รับออเดอร์แล้ว/)
  // POST /public/orders ไม่ส่งเลขออเดอร์กลับมา — อ่านจากการ์ดบนจอแทน
  const ref = (await customer.getByText(/^ออเดอร์ #\w+$/).innerText()).replace('ออเดอร์ #', '')

  await ok(await call(request, 'PATCH', `/orders/${first.id}/status`, { token: t.KITCHEN, data: { status: 'CANCELLED' } }))
  const banner = customer.getByText(`ออเดอร์ #${ref} ถูกยกเลิก`)
  await expect(banner).toBeVisible(LIVE)
  await expect(customer.getByText('ยกเลิกแล้ว', { exact: true })).toBeVisible()
  await expect(customer.getByText('ไม่คิดเงิน', { exact: true })).toBeVisible()
  await expect(currentStep(customer)).toHaveCount(0)

  // สั่งใหม่หลังโดนยกเลิก → stepper ตามออเดอร์ล่าสุด แต่ยังบอกว่าใบเก่าถูกยกเลิก
  await customerOrder(request, session.token, [{ menuItemId: water.id, quantity: 1 }])
  await expect(currentStep(customer)).toHaveText(/รับออเดอร์แล้ว/, LIVE)
  await expect(customer.getByText(/ทั้งหมด 2 รายการ/)).toBeVisible()
  await expect(banner).toBeVisible()

  await customer.context().close()
})
