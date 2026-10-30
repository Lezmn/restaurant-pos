import { test, expect, type APIRequestContext, type Page } from '@playwright/test'
import { call, customerOrder, menuItemByName, ok, openNewSession, serve, tokens } from '../api/api-helpers'
import { checkTableTile, loginAsCashier, paidBillsTable, printPromptPay, slipImage, stubPrint } from '../helpers'

// ⚠️ ต้องรัน backend จริง + seed data (DB ทดสอบเท่านั้น — เก็บเงินจริง)
// สลิป PromptPay จากรูป (ไม่มีเครื่องสแกน): กด "แนบรูป" → อ่าน QR ในเบราว์เซอร์ → เติมข้อความลงช่องสลิป → ส่งตรวจ SlipOK ทางเดิม
// PromptPay พิมพ์ใบเสร็จก่อน (บิลเป็น "รอสลิป") แล้วตรวจสลิปในกล่อง "ตรวจสลิป" ที่เด้งขึ้นมาหลังพิมพ์
// backend ต้องตั้ง SLIPOK_MOCK=true — สลิปขึ้นต้น MOCK-OK = ผ่าน, MOCK-AMOUNT = ยอดไม่ตรง (ไม่ผ่าน)
test.use({ viewport: { width: 1280, height: 900 } })
test.describe.configure({ timeout: 60_000 })

type Tokens = Awaited<ReturnType<typeof tokens>>

/** โต๊ะใหม่ + น้ำเปล่า 2 ขวด เสิร์ฟแล้ว พร้อมเก็บเงิน */
async function servedTable(request: APIRequestContext, t: Tokens) {
  const { table, session } = await openNewSession(request, t)
  const water = await menuItemByName(request, 'น้ำเปล่า')
  const order = await customerOrder(request, session.token, [{ menuItemId: water.id, quantity: 2 }])
  await serve(request, t.KITCHEN, order.id)
  return { tableName: String(table.number), total: water.price * 2 }
}

/**
 * cashier เปิดกล่องรับเงินของโต๊ะ เลือก PromptPay แล้วกด "พิมพ์ใบเสร็จ"
 * บิลบันทึกเป็นรอสลิป โต๊ะหายจากรายการค้างจ่าย และกล่อง "ตรวจสลิป" เด้งขึ้นมาเอง
 */
async function printPromptPayBill(page: Page, tableName: string) {
  await stubPrint(page)
  await page.goto('/employee/check')
  await checkTableTile(page, tableName).getByRole('button', { name: /^รับเงิน/ }).click()
  const dialog = page.getByRole('dialog', { name: `รับเงิน โต๊ะ ${tableName}` })
  await dialog.getByRole('button', { name: 'PromptPay' }).click()
  await expect(dialog.getByRole('button', { name: 'PromptPay' })).toHaveAttribute('aria-pressed', 'true')
  // จำ id ของบิลไว้เก็บกวาด — บิลที่ยังรอสลิปค้างไว้จะไปโผล่เป็นคำเตือนบน Dashboard ของเทสต์ยอดรวม
  const [created, printed] = await Promise.all([
    page.waitForResponse((r) => new URL(r.url()).pathname === '/payments' && r.request().method() === 'POST'),
    printPromptPay(page, dialog),
  ])
  const { id } = (await created.json()) as { id: string }
  return { ...printed, paymentId: id }
}

/** ยกเลิกบิลที่ยังรอสลิปตอนจบเทสต์ (เพิ่งจ่าย STAFF ยกเลิกได้ใน 1 ชม.) */
async function voidBill(request: APIRequestContext, t: Tokens, paymentId: string) {
  await ok(await call(request, 'PATCH', `/payments/${paymentId}/void`, { token: t.STAFF, data: { reason: 'เก็บกวาดเทสต์ (E2E)' } }))
}

const billRow = (page: Page, receiptNo: string) =>
  paidBillsTable(page).getByRole('row').filter({ hasText: receiptNo })

// ทดสอบ: แนบรูปสลิปที่มี QR แล้วช่องสลิปต้องเติมข้อความจาก QR เอง ตรวจผ่าน และบิลขึ้น "ตรวจสลิปแล้ว"
// วิธี: เตรียมโต๊ะน้ำ 2 ขวดที่เสิร์ฟแล้วผ่าน API → cashier รับเงิน PromptPay กดพิมพ์ใบเสร็จ → กล่องตรวจสลิปเด้ง (ปุ่มตรวจยังกดไม่ได้) → แนบรูป PNG ที่มี QR "MOCK-OK-img-…" → เช็กข้อความในช่องสลิปตรงกับ QR และขึ้น "✓ อ่าน QR ได้แล้ว" → กดตรวจสลิป → แถวบิลมี "ตรวจสลิปแล้ว"
test('แนบรูปสลิปที่มี QR → ช่องสลิปเติมเอง ตรวจผ่าน และบิลขึ้น "ตรวจสลิปแล้ว"', async ({ page, request }) => {
  const t = await tokens(request)
  const { tableName } = await servedTable(request, t)
  const payload = `MOCK-OK-img-${Date.now()}`

  await loginAsCashier(page, request)
  const { slipDialog, receiptNo } = await printPromptPayBill(page, tableName)
  // พิมพ์ใบเสร็จแล้วบิลบันทึกไปก่อน — โต๊ะหายจากรายการค้างจ่าย บิลรอสลิป
  await expect(checkTableTile(page, tableName)).toHaveCount(0)
  const check = slipDialog.getByRole('button', { name: 'ตรวจสลิป', exact: true })
  await expect(check).toBeDisabled()

  await slipDialog.getByLabel('แนบรูปสลิป').setInputFiles(await slipImage(page, payload))
  await expect(slipDialog.getByPlaceholder(/ยิงเครื่องสแกน/)).toHaveValue(payload)
  await expect(slipDialog.getByText(/อ่าน QR ได้แล้ว/)).toBeVisible()
  // อ่านได้แล้วปุ่มแนบรูปหาย เหลือปุ่มล้าง
  await expect(slipDialog.getByRole('button', { name: 'แนบรูป' })).toHaveCount(0)
  await expect(slipDialog.getByRole('button', { name: 'ล้าง' })).toBeVisible()

  await check.click()
  await expect(slipDialog).toHaveCount(0)
  await expect(billRow(page, receiptNo).filter({ hasText: 'ตรวจสลิปแล้ว' })).toBeVisible()
})

// ทดสอบ: แนบรูปที่ไม่มี QR ต้องบอกว่า "ไม่พบ QR ในรูป" ช่องสลิปยังว่าง และยังกดตรวจไม่ได้ — บิลยังรอสลิป
// วิธี: เตรียมโต๊ะที่เสิร์ฟแล้ว → cashier รับเงิน PromptPay กดพิมพ์ใบเสร็จ → ในกล่องตรวจสลิปแนบรูป PNG ขาวล้วน → เช็กข้อความเตือน ช่องสลิปว่าง ปุ่มตรวจกดไม่ได้ → ปิดกล่อง แถวบิลยัง "รอสลิป"
test('แนบรูปที่ไม่มี QR → ขึ้น "ไม่พบ QR ในรูป" ตรวจไม่ได้ และบิลยังรอสลิป', async ({ page, request }) => {
  const t = await tokens(request)
  const { tableName } = await servedTable(request, t)

  await loginAsCashier(page, request)
  const { slipDialog, receiptNo, paymentId } = await printPromptPayBill(page, tableName)
  await slipDialog.getByLabel('แนบรูปสลิป').setInputFiles(await slipImage(page, null))

  await expect(slipDialog.getByRole('alert').filter({ hasText: 'ไม่พบ QR ในรูป' })).toBeVisible()
  await expect(slipDialog.getByPlaceholder(/ยิงเครื่องสแกน/)).toHaveValue('')
  await expect(slipDialog.getByRole('button', { name: 'ตรวจสลิป', exact: true })).toBeDisabled()
  await page.keyboard.press('Escape')
  await expect(slipDialog).toHaveCount(0)
  await expect(billRow(page, receiptNo).filter({ hasText: 'รอสลิป' })).toBeVisible()
  await voidBill(request, t, paymentId)
})

// ทดสอบ: สลิปที่ SlipOK ตรวจแล้วไม่ผ่าน (ยอดไม่ตรง) ต้องไม่ผ่าน เห็นเหตุผลในกล่องตรวจสลิป และบิลยังไม่ถือว่าตรวจแล้ว
// วิธี: เตรียมโต๊ะที่เสิร์ฟแล้ว → cashier รับเงิน PromptPay กดพิมพ์ใบเสร็จ → พิมพ์สลิป MOCK-AMOUNT (โหมดจำลอง = ยอดไม่ตรง) → กดตรวจสลิป → เช็กว่า API ไม่ผ่านและเห็น "ยอดในสลิปไม่ตรง" ในกล่อง → ปิดกล่อง แถวบิลยังไม่ "ตรวจสลิปแล้ว"
test('สลิปไม่ผ่าน (ยอดไม่ตรง) → ตรวจไม่ผ่าน เห็นเหตุผล และบิลยังไม่ถือว่าตรวจแล้ว', async ({ page, request }) => {
  const t = await tokens(request)
  const { tableName } = await servedTable(request, t)

  await loginAsCashier(page, request)
  const { slipDialog, receiptNo, paymentId } = await printPromptPayBill(page, tableName)
  await slipDialog.getByPlaceholder(/ยิงเครื่องสแกน/).fill(`MOCK-AMOUNT-e2e-${Date.now()}`)
  const [res] = await Promise.all([
    page.waitForResponse((r) => /\/payments\/[^/]+\/slip$/.test(new URL(r.url()).pathname) && r.request().method() === 'POST'),
    slipDialog.getByRole('button', { name: 'ตรวจสลิป', exact: true }).click(),
  ])
  expect(res.ok()).toBe(false)

  await expect(slipDialog).toContainText('ยอดในสลิปไม่ตรงกับยอดที่ต้องจ่าย')
  await page.keyboard.press('Escape')
  await expect(billRow(page, receiptNo)).toBeVisible()
  await expect(billRow(page, receiptNo).filter({ hasText: 'ตรวจสลิปแล้ว' })).toHaveCount(0)
  await voidBill(request, t, paymentId)
})
