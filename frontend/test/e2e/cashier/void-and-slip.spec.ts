import { test, expect, type APIRequestContext, type Page } from '@playwright/test'
import { call, customerOrder, menuItemByName, ok, openNewSession, serve, tokens } from '../api/api-helpers'
import { checkTableTile, loginAsAdmin, loginAsCashier, paidBillsTable } from '../helpers'

// ⚠️ ต้องรัน backend จริง + seed data (DB ทดสอบเท่านั้น — เก็บเงิน/ยกเลิกบิลจริง)
// เทสสลิปค้างใช้ SlipOK โหมดจำลอง: backend ต้องตั้ง SLIPOK_MOCK=true (สลิป MOCK-DOWN-* = ธนาคารล่ม → รอตรวจ)
// หน้า Check ส่วนที่เดิมเทสแค่ฝั่ง API: ยกเลิกบิลจากตาราง, ADMIN ยืนยันรับ PromptPay เอง, แผงสลิปที่ต้องตาม
test.use({ viewport: { width: 1280, height: 900 } })
// แต่ละเทสเตรียมโต๊ะผ่าน API + login สลับ role — รันพร้อมชุดใหญ่ (3 worker) เครื่องช้าลงจนเกิน 30 วิ ได้
test.describe.configure({ timeout: 60_000 })

type Tokens = Awaited<ReturnType<typeof tokens>>

/** โต๊ะใหม่ + น้ำเปล่า 2 ขวด เสิร์ฟแล้ว พร้อมเก็บเงิน */
async function servedTable(request: APIRequestContext, t: Tokens) {
  const { table, session } = await openNewSession(request, t)
  const water = await menuItemByName(request, 'น้ำเปล่า')
  const order = await customerOrder(request, session.token, [{ menuItemId: water.id, quantity: 2 }])
  await serve(request, t.KITCHEN, order.id)
  return { tableName: String(table.number), sessionId: session.id, total: water.price * 2 }
}

const billRow = (page: Page, receiptNo: string) =>
  paidBillsTable(page).getByRole('row').filter({ hasText: receiptNo })

const slipPanel = (page: Page) =>
  page.locator('section', { has: page.getByRole('heading', { name: /สลิป PromptPay ที่ต้องตาม/ }) })

// ทดสอบ: ยกเลิกบิลจากตารางบิลวันนี้ต้องใส่เหตุผลก่อน, บิลขึ้น "ยกเลิกแล้ว" พร้อมเหตุผล และโต๊ะกลับมาให้เก็บเงินใหม่ด้วยยอดเดิม
// วิธี: เตรียมโต๊ะน้ำ 2 ขวดที่เสิร์ฟแล้วและเก็บเงินสดผ่าน API → cashier เปิดหน้า Check กดยกเลิกบิล → ปุ่มยืนยันต้องกดไม่ได้จนกว่าจะใส่เหตุผล → เช็กแถวบิล (ยกเลิกแล้ว, เหตุผล, ไม่มีปุ่ม) และการ์ดโต๊ะกลับมาพร้อมยอดเดิม → เก็บเงินใหม่ผ่าน API ตอนจบ
test('ยกเลิกบิลจากตาราง "บิลที่เก็บแล้ววันนี้": ต้องใส่เหตุผล → บิลขึ้นยกเลิกแล้ว และโต๊ะกลับมาให้เก็บเงินใหม่', async ({ page, request }) => {
  const t = await tokens(request)
  const { tableName, sessionId, total } = await servedTable(request, t)
  const paid = await ok<{ receipt: { number: string } }>(
    await call(request, 'POST', '/payments', { token: t.STAFF, data: { tableSessionId: sessionId, method: 'CASH' } }),
  )
  const receiptNo = paid.receipt.number

  await loginAsCashier(page, request)
  await page.goto('/employee/check')
  await expect(checkTableTile(page, tableName)).toHaveCount(0)

  await billRow(page, receiptNo).getByRole('button', { name: 'ยกเลิกบิล' }).click()
  const dialog = page.getByRole('dialog', { name: 'ยกเลิกบิล' })
  await expect(dialog).toContainText(`โต๊ะ ${tableName}`)
  await expect(dialog).toContainText(receiptNo)
  const confirm = dialog.getByRole('button', { name: 'ยืนยันยกเลิกบิล' })
  await expect(confirm).toBeDisabled()
  await dialog.getByLabel(/เหตุผล/).fill('กดจ่ายผิดโต๊ะ (E2E)')
  await confirm.click()
  await expect(dialog).toHaveCount(0)

  // บิลเดิมยังอยู่ในตารางแต่ขึ้น "ยกเลิกแล้ว" พร้อมเหตุผล และกดจัดการอีกไม่ได้
  const row = billRow(page, receiptNo)
  await expect(row).toContainText('ยกเลิกแล้ว')
  await expect(row).toContainText('กดจ่ายผิดโต๊ะ (E2E)')
  await expect(row.getByRole('button')).toHaveCount(0)

  // โต๊ะเปิดกลับมาพร้อมยอดเดิม ให้เก็บเงินใหม่ได้
  const tile = checkTableTile(page, tableName)
  await expect(tile).toBeVisible({ timeout: 10_000 })
  await expect(tile.getByRole('button', { name: new RegExp(`^รับเงิน โต๊ะ ${tableName} ฿${total}$`) })).toBeVisible()

  // เก็บกวาด: เก็บเงินใหม่ให้โต๊ะปิด
  await ok(await call(request, 'POST', '/payments', { token: t.STAFF, data: { tableSessionId: sessionId, method: 'CASH' } }))
})

// ทดสอบ: ADMIN รับ PromptPay โดยไม่มีสลิปได้ ถ้าติ๊กยืนยันเองและใส่เหตุผล แล้วบิลต้องขึ้นป้าย "ยืนยันเอง"
// วิธี: เตรียมโต๊ะที่เสิร์ฟแล้ว → admin กดรับเงินเป็น PromptPay → ปุ่มบันทึกกดไม่ได้ → ติ๊กยืนยันเอง (ช่องสแกนถูกปิด) ปุ่มยังกดไม่ได้ → ใส่เหตุผลแล้วบันทึก → เช็กใบเสร็จ การ์ดโต๊ะหาย และแถวบิลมีคำว่า "ยืนยันเอง"
test('ADMIN รับ PromptPay โดยไม่มีสลิป: ติ๊กยืนยันเองพร้อมเหตุผล → บันทึกได้ และบิลขึ้นป้าย "ยืนยันเอง"', async ({ page, request }) => {
  const t = await tokens(request)
  const { tableName, total } = await servedTable(request, t)

  await loginAsAdmin(page, request)
  await page.goto('/employee/check')
  await checkTableTile(page, tableName).getByRole('button', { name: /^รับเงิน/ }).click()

  const dialog = page.getByRole('dialog', { name: `รับเงิน โต๊ะ ${tableName}` })
  await dialog.getByRole('button', { name: 'PromptPay' }).click()
  const save = dialog.getByRole('button', { name: `รับเงิน ฿${total}` })
  await expect(save).toBeDisabled()

  await dialog.getByRole('checkbox', { name: /ยืนยันรับเงินเอง \(ADMIN\)/ }).check()
  await expect(dialog.getByPlaceholder(/ยิงเครื่องสแกน/)).toBeDisabled()
  await expect(save).toBeDisabled()
  await dialog.getByPlaceholder(/เช็คยอดเข้าในแอปธนาคาร/).fill('ลูกค้าโชว์แอป ยอดเข้าแล้ว (E2E)')
  await save.click()

  const receipt = page.getByRole('dialog', { name: 'ใบเสร็จรับเงิน' })
  await expect(receipt).toBeVisible()
  await expect(receipt.getByText('PromptPay')).toBeVisible()
  const receiptNo = (await receipt.getByText(/^RCPT-/).innerText()).trim()
  await receipt.getByRole('button', { name: 'ปิด' }).click()

  await expect(checkTableTile(page, tableName)).toHaveCount(0)
  await expect(billRow(page, receiptNo)).toContainText('ยืนยันเอง')
})

// ทดสอบ: สลิปที่ตรวจไม่ได้ต้องขึ้นในแผง "สลิป PromptPay ที่ต้องตาม": STAFF กดตรวจอีกครั้งได้แต่ยืนยันเองไม่ได้ ส่วน ADMIN ยืนยันเองพร้อมเหตุผลแล้วรายการหายจากแผง
// วิธี: สร้างบิล PromptPay ด้วยสลิป MOCK-DOWN (ธนาคารล่ม → รอตรวจ ถ้า backend ไม่ได้ตั้ง SLIPOK_MOCK จะข้าม) → cashier เช็กรายการในแผง กดตรวจอีกครั้ง รอ response สำเร็จ → admin กดยืนยันเอง ใส่เหตุผล → เช็กว่าหายจากแผง และแถวบิลขึ้น "ยืนยันเอง"
test('สลิปรอตรวจขึ้นแผง "สลิป PromptPay ที่ต้องตาม": STAFF กดตรวจอีกครั้งได้ · ADMIN ยืนยันเองแล้วหายจากแผง', async ({ page, request }) => {
  const t = await tokens(request)
  const { tableName, sessionId, total } = await servedTable(request, t)
  const pending = await ok<{ id: string; slipStatus: string; receipt: { number: string } }>(
    await call(request, 'POST', '/payments', {
      token: t.STAFF,
      data: { tableSessionId: sessionId, method: 'PROMPTPAY', slipPayload: `MOCK-DOWN-e2e-${Date.now()}` },
    }),
  )
  test.skip(pending.slipStatus !== 'PENDING', 'backend ไม่ได้ตั้ง SLIPOK_MOCK=true — สร้างสลิปรอตรวจไม่ได้')

  // STAFF: เห็นบิลในแผง กดตรวจอีกครั้ง (ธนาคารยังล่ม → ยังค้างอยู่) และไม่มีปุ่มยืนยันเอง
  await loginAsCashier(page, request)
  await page.goto('/employee/check')
  const item = slipPanel(page).getByRole('listitem').filter({ hasText: `โต๊ะ ${tableName} ·` })
  await expect(item).toContainText(`฿${total}`)
  await expect(item).toContainText(pending.receipt.number)
  await expect(item).toContainText('รอตรวจสลิป')
  await expect(item.getByRole('button', { name: 'ยืนยันเอง' })).toHaveCount(0)

  const [recheck] = await Promise.all([
    page.waitForResponse((r) => r.url().includes(`/payments/${pending.id}/slip/recheck`)),
    item.getByRole('button', { name: 'ตรวจอีกครั้ง' }).click(),
  ])
  expect(recheck.ok()).toBe(true)
  await expect(item.getByRole('button', { name: 'ตรวจอีกครั้ง' })).toBeEnabled()
  await expect(billRow(page, pending.receipt.number)).toContainText(/รอตรวจสลิป|สลิปไม่ผ่าน/)

  // ADMIN: ยืนยันเองพร้อมเหตุผล → หายจากแผง และบิลเปลี่ยนเป็น "ยืนยันเอง"
  await loginAsAdmin(page, request)
  await page.goto('/employee/check')
  const adminItem = slipPanel(page).getByRole('listitem').filter({ hasText: `โต๊ะ ${tableName} ·` })
  await adminItem.getByRole('button', { name: 'ยืนยันเอง' }).click()
  const dialog = page.getByRole('dialog', { name: 'ยืนยันรับเงินเอง' })
  const confirm = dialog.getByRole('button', { name: 'ยืนยันว่าเงินเข้าแล้ว' })
  await expect(confirm).toBeDisabled()
  await dialog.getByLabel(/เหตุผล/).fill('เช็คแอปธนาคารแล้ว ยอดเข้า (E2E)')
  await confirm.click()
  await expect(dialog).toHaveCount(0)

  await expect(adminItem).toHaveCount(0)
  await expect(billRow(page, pending.receipt.number)).toContainText('ยืนยันเอง')
})
