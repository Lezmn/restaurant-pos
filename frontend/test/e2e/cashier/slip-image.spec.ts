import { test, expect, type APIRequestContext, type Page } from '@playwright/test'
import { customerOrder, menuItemByName, openNewSession, serve, tokens } from '../api/api-helpers'
import { checkTableTile, loginAsCashier, paidBillsTable, slipImage } from '../helpers'

// ⚠️ ต้องรัน backend จริง + seed data (DB ทดสอบเท่านั้น — เก็บเงินจริง)
// สลิป PromptPay จากรูป (ไม่มีเครื่องสแกน): กด "แนบรูป" → อ่าน QR ในเบราว์เซอร์ → เติมข้อความลงช่องสลิป → ส่งตรวจ SlipOK ทางเดิม
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

/** cashier เปิดกล่องรับเงินของโต๊ะ แล้วสลับเป็น PromptPay */
async function openPromptPay(page: Page, tableName: string) {
  await page.goto('/employee/check')
  await checkTableTile(page, tableName).getByRole('button', { name: /^รับเงิน/ }).click()
  const dialog = page.getByRole('dialog', { name: `รับเงิน โต๊ะ ${tableName}` })
  await dialog.getByRole('button', { name: 'PromptPay' }).click()
  await expect(dialog.getByRole('button', { name: 'PromptPay' })).toHaveAttribute('aria-pressed', 'true')
  return dialog
}

// ทดสอบ: แนบรูปสลิปที่มี QR แล้วช่องสลิปต้องเติมข้อความจาก QR เอง บันทึกได้ และบิลขึ้น "ตรวจสลิปแล้ว"
// วิธี: เตรียมโต๊ะน้ำ 2 ขวดที่เสิร์ฟแล้วผ่าน API → cashier เปิดกล่องรับเงินเลือก PromptPay → แนบรูป PNG ที่มี QR "MOCK-OK-img-…" (setInputFiles) → เช็กข้อความในช่องสลิปตรงกับ QR และขึ้น "✓ อ่าน QR ได้แล้ว" → กดรับเงิน → เช็กใบเสร็จ PromptPay และแถวบิลมี "ตรวจสลิปแล้ว"
test('แนบรูปสลิปที่มี QR → ช่องสลิปเติมเอง บันทึกได้ และบิลขึ้น "ตรวจสลิปแล้ว"', async ({ page, request }) => {
  const t = await tokens(request)
  const { tableName, total } = await servedTable(request, t)
  const payload = `MOCK-OK-img-${Date.now()}`

  await loginAsCashier(page, request)
  const dialog = await openPromptPay(page, tableName)
  const save = dialog.getByRole('button', { name: `รับเงิน ฿${total}` })
  await expect(save).toBeDisabled()

  await dialog.getByLabel('แนบรูปสลิป').setInputFiles(await slipImage(page, payload))
  await expect(dialog.getByPlaceholder(/ยิงเครื่องสแกน/)).toHaveValue(payload)
  await expect(dialog.getByText(/อ่าน QR ได้แล้ว/)).toBeVisible()
  // อ่านได้แล้วปุ่มแนบรูปหาย เหลือปุ่มล้าง
  await expect(dialog.getByRole('button', { name: 'แนบรูป' })).toHaveCount(0)
  await expect(dialog.getByRole('button', { name: 'ล้าง' })).toBeVisible()

  await save.click()
  const receipt = page.getByRole('dialog', { name: 'ใบเสร็จรับเงิน' })
  await expect(receipt.getByText('PromptPay')).toBeVisible()
  const receiptNo = (await receipt.getByText(/^RCPT-/).innerText()).trim()
  await receipt.getByRole('button', { name: 'ปิด' }).click()

  await expect(checkTableTile(page, tableName)).toHaveCount(0)
  await expect(
    paidBillsTable(page).getByRole('row').filter({ hasText: receiptNo }).filter({ hasText: 'ตรวจสลิปแล้ว' }),
  ).toBeVisible()
})

// ทดสอบ: แนบรูปที่ไม่มี QR ต้องบอกว่า "ไม่พบ QR ในรูป" ช่องสลิปยังว่าง และยังรับเงินไม่ได้
// วิธี: เตรียมโต๊ะที่เสิร์ฟแล้ว → cashier เปิดกล่องรับเงินเลือก PromptPay → แนบรูป PNG ขาวล้วน → เช็กข้อความเตือน ช่องสลิปว่าง และปุ่มรับเงินยังกดไม่ได้ → ปิดกล่องโดยไม่บันทึก
test('แนบรูปที่ไม่มี QR → ขึ้น "ไม่พบ QR ในรูป" และยังรับเงินไม่ได้', async ({ page, request }) => {
  const t = await tokens(request)
  const { tableName, total } = await servedTable(request, t)

  await loginAsCashier(page, request)
  const dialog = await openPromptPay(page, tableName)
  await dialog.getByLabel('แนบรูปสลิป').setInputFiles(await slipImage(page, null))

  await expect(dialog.getByRole('alert').filter({ hasText: 'ไม่พบ QR ในรูป' })).toBeVisible()
  await expect(dialog.getByPlaceholder(/ยิงเครื่องสแกน/)).toHaveValue('')
  await expect(dialog.getByRole('button', { name: `รับเงิน ฿${total}` })).toBeDisabled()
  await page.keyboard.press('Escape')
  await expect(checkTableTile(page, tableName)).toBeVisible()
})

// ทดสอบ: สลิปที่ SlipOK ตรวจแล้วไม่ผ่าน (ยอดไม่ตรง) ต้องบันทึกไม่ได้ เห็นเหตุผลในกล่องรับเงิน และโต๊ะยังรอเก็บเงินอยู่
// วิธี: เตรียมโต๊ะที่เสิร์ฟแล้ว → cashier เลือก PromptPay พิมพ์สลิป MOCK-AMOUNT (โหมดจำลอง = ยอดไม่ตรง) → กดรับเงิน → เช็กข้อความ "ยอดในสลิปไม่ตรง" ในกล่อง ไม่มีใบเสร็จ → ปิดกล่อง การ์ดโต๊ะยังอยู่พร้อมปุ่มรับเงิน
test('สลิปไม่ผ่าน (ยอดไม่ตรง) → บันทึกไม่ได้ เห็นเหตุผล และโต๊ะยังรอเก็บเงิน', async ({ page, request }) => {
  const t = await tokens(request)
  const { tableName, total } = await servedTable(request, t)

  await loginAsCashier(page, request)
  const dialog = await openPromptPay(page, tableName)
  await dialog.getByPlaceholder(/ยิงเครื่องสแกน/).fill(`MOCK-AMOUNT-e2e-${Date.now()}`)
  const [res] = await Promise.all([
    page.waitForResponse((r) => new URL(r.url()).pathname === '/payments' && r.request().method() === 'POST'),
    dialog.getByRole('button', { name: `รับเงิน ฿${total}` }).click(),
  ])
  expect(res.status()).toBe(400)

  await expect(dialog).toContainText('ยอดในสลิปไม่ตรงกับยอดที่ต้องจ่าย')
  await expect(page.getByRole('dialog', { name: 'ใบเสร็จรับเงิน' })).toHaveCount(0)
  await page.keyboard.press('Escape')
  const tile = checkTableTile(page, tableName)
  await expect(tile.getByRole('button', { name: /^รับเงิน/ })).toBeVisible()
})
