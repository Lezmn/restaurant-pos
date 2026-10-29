import { test, expect, type Locator } from '@playwright/test'
import { call, customerOrder, menuItemByName, ok, openNewSession, serve, tokens } from '../api/api-helpers'
import { loginAsStaff, paidBillsTable } from '../helpers'

// ⚠️ ต้องรัน backend จริง + seed data (DB ทดสอบเท่านั้น — สร้างโต๊ะ/ออเดอร์/บิลจริง)
// ใบเสร็จตอนพิมพ์ (@media print ใน index.css): เครื่องพิมพ์ความร้อนวาดตัวเล็ก/บางขาด ๆ หาย ๆ
// จึงขยายตัวอักษร ตัวหนาทั้งใบ ใช้ Tahoma และเส้นคั่นหนา 2px — เฉพาะตอนพิมพ์ จอยังเหมือนเดิม
// กล่องพิมพ์จริงของเบราว์เซอร์ทดสอบไม่ได้ จึงสลับ media เป็น print แล้วอ่านสไตล์ที่คำนวณได้แทน

type Style = { fontSize: string; fontWeight: string; fontFamily: string; borderTopWidth: string }
const styleOf = (el: Locator) =>
  el.evaluate((node): Style => {
    const s = getComputedStyle(node)
    return { fontSize: s.fontSize, fontWeight: s.fontWeight, fontFamily: s.fontFamily, borderTopWidth: s.borderTopWidth }
  })

// ทดสอบ: ตอนพิมพ์ ใบเสร็จต้องตัวใหญ่ขึ้น (text-sm 12pt = 16px, text-lg 16pt ≈ 21.33px) ตัวหนาทั้งใบ ใช้ Tahoma และเส้นคั่น 2px
//        แต่บนจอต้องเหมือนเดิม (text-sm 14px, ตัวไม่หนา)
// วิธี: เปิดโต๊ะ สั่งน้ำ ครัวเสิร์ฟ และเก็บเงินสดผ่าน API → STAFF เปิดใบเสร็จจากตารางบิลวันนี้ → อ่านสไตล์บนจอ
//       → page.emulateMedia({ media: 'print' }) แล้วอ่านใหม่ → สลับกลับ screen ต้องกลับเป็นค่าเดิม
test('ใบเสร็จตอนพิมพ์: ตัวใหญ่ขึ้น ตัวหนาทั้งใบ Tahoma เส้นคั่น 2px — บนจอเหมือนเดิม', async ({ page, request }) => {
  const t = await tokens(request)
  const { session } = await openNewSession(request, t)
  const water = await menuItemByName(request, 'น้ำเปล่า')
  const order = await customerOrder(request, session.token, [{ menuItemId: water.id, quantity: 1 }])
  await serve(request, t.KITCHEN, order.id)
  const payment = await ok<{ receipt: { number: string } }>(
    await call(request, 'POST', '/payments', { token: t.STAFF, data: { tableSessionId: session.id, method: 'CASH' } }),
  )

  await loginAsStaff(page, request)
  await page.goto('/employee/check')
  await paidBillsTable(page)
    .getByRole('row')
    .filter({ hasText: payment.receipt.number })
    .getByRole('button', { name: 'ใบเสร็จ', exact: true })
    .click()
  const dialog = page.getByRole('dialog', { name: 'ใบเสร็จรับเงิน' })
  await expect(dialog).toBeVisible()

  // ตอนพิมพ์ CSS ซ่อนทุกอย่างนอกใบเสร็จ (รวมชื่อ dialog) — getByRole หาไม่เจอ จึงอ้างด้วย CSS ตรง ๆ
  const receipt = page.locator('dialog[open] .print-receipt')
  const shopName = receipt.locator('p.text-lg').first()
  const details = receipt.locator('dl.text-sm').first() // เลขที่ / โต๊ะ / วันที่ / ชำระโดย (มีเส้นคั่นบน-ล่าง)
  const label = details.locator('dt').first() // "เลขที่" — ไม่ได้ตั้งตัวหนาไว้เอง

  await test.step('บนจอ: ขนาดและน้ำหนักเดิม', async () => {
    expect((await styleOf(details)).fontSize).toBe('14px')
    expect((await styleOf(label)).fontWeight).toBe('400')
    expect((await styleOf(details)).borderTopWidth).toBe('1px')
  })

  await test.step('ตอนพิมพ์: ใหญ่ขึ้น หนาทั้งใบ Tahoma เส้น 2px', async () => {
    await page.emulateMedia({ media: 'print' })
    const root = await styleOf(receipt)
    expect(root.fontFamily).toMatch(/^Tahoma/)
    expect(root.fontWeight).toBe('700')
    expect((await styleOf(details)).fontSize).toBe('16px') // 12pt
    expect((await styleOf(label)).fontWeight).toBe('700') // ตัวที่บนจอไม่หนา ก็ต้องหนาตอนพิมพ์
    expect((await styleOf(details)).borderTopWidth).toBe('2px')
    // ชื่อร้านใหญ่และหนากว่าส่วนอื่นอีกขั้น
    const shop = await styleOf(shopName)
    expect(parseFloat(shop.fontSize)).toBeCloseTo(21.33, 1) // 16pt
    expect(shop.fontWeight).toBe('800')
  })

  await test.step('สลับกลับเป็นจอ: กลับเป็นค่าเดิม', async () => {
    await page.emulateMedia({ media: 'screen' })
    expect((await styleOf(details)).fontSize).toBe('14px')
    expect((await styleOf(label)).fontWeight).toBe('400')
  })
})
