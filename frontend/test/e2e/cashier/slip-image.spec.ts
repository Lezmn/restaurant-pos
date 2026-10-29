import { test, expect, type APIRequestContext, type Page } from '@playwright/test'
import { customerOrder, menuItemByName, openNewSession, serve, tokens } from '../api/api-helpers'
import { checkTableTile, loginAsCashier, paidBillsTable, printPromptPayReceipt, slipDialog, slipImage } from '../helpers'

// ⚠️ ต้องรัน backend จริง + seed data (DB ทดสอบเท่านั้น — เก็บเงินจริง)
// สลิป PromptPay จากรูป (ไม่มีเครื่องสแกน): พิมพ์ใบเสร็จมี QR → กล่อง "ตรวจสลิป" เด้งต่อ → กด "แนบรูป" → อ่าน QR ในเบราว์เซอร์ → เติมข้อความลงช่องสลิป → ส่งตรวจ SlipOK
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

/** cashier เปิดกล่องรับเงินของโต๊ะ สลับเป็น PromptPay แล้วกด "พิมพ์ใบเสร็จ" → คืนกล่อง "ตรวจสลิป" ที่เด้งต่อ + เลขใบเสร็จ */
async function printAndOpenSlipDialog(page: Page, tableName: string) {
  await page.goto('/employee/check')
  await checkTableTile(page, tableName).getByRole('button', { name: /^รับเงิน/ }).click()
  const dialog = page.getByRole('dialog', { name: `รับเงิน โต๊ะ ${tableName}` })
  await dialog.getByRole('button', { name: 'PromptPay' }).click()
  await expect(dialog.getByRole('button', { name: 'PromptPay' })).toHaveAttribute('aria-pressed', 'true')
  const receiptNo = await printPromptPayReceipt(page, dialog)
  const slip = slipDialog(page)
  await expect(slip).toBeVisible()
  return { slip, receiptNo }
}

// ทดสอบ: แนบรูปสลิปที่มี QR แล้วช่องสลิปต้องเติมข้อความจาก QR เอง ตรวจผ่าน และบิลขึ้น "ตรวจสลิปแล้ว"
// วิธี: เตรียมโต๊ะน้ำ 2 ขวดที่เสิร์ฟแล้วผ่าน API → cashier เลือก PromptPay กดพิมพ์ใบเสร็จ → ในกล่องตรวจสลิปแนบรูป PNG ที่มี QR "MOCK-OK-img-…" (setInputFiles) → เช็กข้อความในช่องสลิปตรงกับ QR และขึ้น "✓ อ่าน QR ได้แล้ว" → กดตรวจสลิป → เช็กแถวบิลมี "ตรวจสลิปแล้ว"
test('แนบรูปสลิปที่มี QR → ช่องสลิปเติมเอง ตรวจผ่าน และบิลขึ้น "ตรวจสลิปแล้ว"', async ({ page, request }) => {
  const t = await tokens(request)
  const { tableName } = await servedTable(request, t)
  const payload = `MOCK-OK-img-${Date.now()}`

  await loginAsCashier(page, request)
  const { slip, receiptNo } = await printAndOpenSlipDialog(page, tableName)
  const check = slip.getByRole('button', { name: 'ตรวจสลิป', exact: true })
  await expect(check).toBeDisabled()

  await slip.getByLabel('แนบรูปสลิป').setInputFiles(await slipImage(page, payload))
  await expect(slip.getByPlaceholder(/ยิงเครื่องสแกน/)).toHaveValue(payload)
  await expect(slip.getByText(/อ่าน QR ได้แล้ว/)).toBeVisible()
  // อ่านได้แล้วปุ่มแนบรูปหาย เหลือปุ่มล้าง
  await expect(slip.getByRole('button', { name: 'แนบรูป' })).toHaveCount(0)
  await expect(slip.getByRole('button', { name: 'ล้าง' })).toBeVisible()

  await check.click()
  await expect(slip).toHaveCount(0)

  await expect(checkTableTile(page, tableName)).toHaveCount(0)
  await expect(
    paidBillsTable(page).getByRole('row').filter({ hasText: receiptNo }).filter({ hasText: 'ตรวจสลิปแล้ว' }),
  ).toBeVisible()
})

// ทดสอบ: แนบรูปที่ไม่มี QR ต้องบอกว่า "ไม่พบ QR ในรูป" ช่องสลิปยังว่าง และยังตรวจสลิปไม่ได้ (บิลยังรอสลิป)
// วิธี: เตรียมโต๊ะที่เสิร์ฟแล้ว → cashier เลือก PromptPay กดพิมพ์ใบเสร็จ → แนบรูป PNG ขาวล้วนในกล่องตรวจสลิป → เช็กข้อความเตือน ช่องสลิปว่าง ปุ่มตรวจสลิปกดไม่ได้ → ปิดกล่อง บิลยังขึ้น "รอสลิป" พร้อมปุ่มตรวจสลิป
test('แนบรูปที่ไม่มี QR → ขึ้น "ไม่พบ QR ในรูป" และยังตรวจสลิปไม่ได้', async ({ page, request }) => {
  const t = await tokens(request)
  const { tableName } = await servedTable(request, t)

  await loginAsCashier(page, request)
  const { slip, receiptNo } = await printAndOpenSlipDialog(page, tableName)
  await slip.getByLabel('แนบรูปสลิป').setInputFiles(await slipImage(page, null))

  await expect(slip.getByRole('alert').filter({ hasText: 'ไม่พบ QR ในรูป' })).toBeVisible()
  await expect(slip.getByPlaceholder(/ยิงเครื่องสแกน/)).toHaveValue('')
  await expect(slip.getByRole('button', { name: 'ตรวจสลิป', exact: true })).toBeDisabled()
  await slip.getByRole('button', { name: 'กลับ' }).click()
  await expect(slip).toHaveCount(0)

  const row = paidBillsTable(page).getByRole('row').filter({ hasText: receiptNo })
  await expect(row).toContainText('รอสลิป')
  await expect(row.getByRole('button', { name: 'ตรวจสลิป' })).toBeVisible()
})

// ทดสอบ: สลิปที่ SlipOK ตรวจแล้วไม่ผ่าน (ยอดไม่ตรง) ต้องเห็นเหตุผลในกล่อง กล่องไม่ปิด และบิลยังรอสลิปให้แนบใบใหม่
// วิธี: เตรียมโต๊ะที่เสิร์ฟแล้ว → cashier เลือก PromptPay กดพิมพ์ใบเสร็จ → พิมพ์สลิป MOCK-AMOUNT (โหมดจำลอง = ยอดไม่ตรง) กดตรวจสลิป → เช็กได้ 400 และข้อความ "ยอดในสลิปไม่ตรง" ในกล่อง → ปิดกล่อง บิลยังรอสลิป ไม่ขึ้น "ตรวจสลิปแล้ว"
test('สลิปไม่ผ่าน (ยอดไม่ตรง) → เห็นเหตุผลในกล่อง และบิลยังรอสลิป', async ({ page, request }) => {
  const t = await tokens(request)
  const { tableName } = await servedTable(request, t)

  await loginAsCashier(page, request)
  const { slip, receiptNo } = await printAndOpenSlipDialog(page, tableName)
  await slip.getByPlaceholder(/ยิงเครื่องสแกน/).fill(`MOCK-AMOUNT-e2e-${Date.now()}`)
  const [res] = await Promise.all([
    page.waitForResponse((r) => /\/payments\/[^/]+\/slip$/.test(new URL(r.url()).pathname) && r.request().method() === 'POST'),
    slip.getByRole('button', { name: 'ตรวจสลิป', exact: true }).click(),
  ])
  expect(res.status()).toBe(400)

  await expect(slip).toContainText('ยอดในสลิปไม่ตรงกับยอดที่ต้องจ่าย')
  await slip.getByRole('button', { name: 'กลับ' }).click()
  const row = paidBillsTable(page).getByRole('row').filter({ hasText: receiptNo })
  await expect(row).toContainText('รอสลิป')
  await expect(row).not.toContainText('ตรวจสลิปแล้ว')
})
