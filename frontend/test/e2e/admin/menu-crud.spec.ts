import { test, expect, devices } from '@playwright/test'
import { call, openNewSession, tokens, uniqueName } from '../api/api-helpers'
import { hideCallStaffAlerts, loginAsAdmin } from '../helpers'

// ⚠️ ต้องรัน backend จริง + seed data (DB ทดสอบเท่านั้น — สร้าง/แก้/ลบเมนูและวัตถุดิบจริง)
// ADMIN จัดการเมนู/วัตถุดิบผ่านหน้า Manage แล้วลูกค้าที่สแกน QR เห็นผลจริง
// ใช้ชื่อไม่ซ้ำทุกครั้ง และลบทิ้งท้ายเทสต์ (เมนูที่ยังไม่เคยถูกสั่งลบได้)
// การลบเมนูที่เคยถูกสั่งแล้ว (ซ่อนแทนลบ) อยู่ใน PR #47 ที่ยังไม่ merge — ยังไม่เทสต์ในไฟล์นี้
test.use({ viewport: { width: 1280, height: 900 } })
test.describe.configure({ timeout: 60_000 })

// ทดสอบ: ADMIN เพิ่มเมนูใหม่พร้อมตัวเลือกจากฟอร์ม (ต้องกรอกชื่อก่อน), ลูกค้าเห็นเมนูและตัวเลือกพร้อมราคา, แก้ราคาแล้วลูกค้าเห็นราคาใหม่, ลบแล้วหายทั้งหน้า Manage และหน้าลูกค้า
// วิธี: เปิดโต๊ะผ่าน API → admin เปิด /employee/manage กด "เพิ่มเมนู" → กดบันทึกตอนยังว่าง เช็กช่องชื่อขึ้นผิด → กรอกชื่อ/ราคา 65/หมวด + ตัวเลือกเพิ่มเติม "ชีส…" +15 → บันทึก เช็ก toast และการ์ด → มือถือลูกค้าเห็นเมนู ฿65 และตัวเลือก +15 → admin แก้ราคาเป็น 70 → ลูกค้า reload เห็น ฿70 → admin ลบเมนู ยืนยัน → การ์ดหาย ลูกค้า reload ไม่เห็นเมนู → ถ้าค้าง ลบผ่าน API (ใน finally)
test('ADMIN เพิ่มเมนู + ตัวเลือก → ลูกค้าเห็น · แก้ราคา → ลูกค้าเห็นราคาใหม่ · ลบ → หายทั้งสองฝั่ง', async ({
  browser,
  page,
  request,
}) => {
  const t = await tokens(request)
  const { session } = await openNewSession(request, t)
  const name = uniqueName('ข้าวผัดทดสอบ')
  const optionName = uniqueName('ชีส')
  let menuId: string | undefined

  const ctx = await browser.newContext({ ...devices['iPhone 13'], viewport: { width: 375, height: 812 } })
  const customer = await ctx.newPage()
  try {
    await hideCallStaffAlerts(page)
    await loginAsAdmin(page, request)
    await page.goto('/employee/manage')
    const card = page.locator('article').filter({ has: page.getByText(name, { exact: true }) })

    await test.step('เพิ่มเมนูพร้อมตัวเลือก', async () => {
      await page.getByRole('button', { name: 'เพิ่มเมนู', exact: true }).click()
      const dialog = page.getByRole('dialog', { name: 'เพิ่มเมนูใหม่' })
      const nameField = dialog.getByPlaceholder('เช่น ข้าวผัดกะเพรา')
      // ยังไม่กรอกชื่อ → บันทึกไม่ผ่าน ช่องชื่อถูกติดว่าผิด
      await dialog.getByRole('button', { name: 'บันทึก', exact: true }).click()
      await expect(nameField).toHaveAttribute('aria-invalid', 'true')

      await nameField.fill(name)
      await dialog.getByLabel(/ราคา \(บาท\)/).fill('65')
      await dialog.locator('select[name="category"]').selectOption({ label: 'อาหารจานเดียว' })
      await dialog.getByLabel('กลุ่มตัวเลือก').selectOption({ label: 'เพิ่มเติม' })
      await dialog.getByLabel('ชื่อตัวเลือกใหม่').fill(optionName)
      await dialog.getByLabel('ราคาเพิ่ม (บาท)').fill('15')
      await dialog.getByRole('button', { name: '+ เพิ่ม' }).click()
      await expect(dialog.getByRole('listitem').filter({ hasText: optionName })).toContainText('+฿15')

      const [created] = await Promise.all([
        page.waitForResponse((r) => new URL(r.url()).pathname === '/menu' && r.request().method() === 'POST' && r.ok()),
        dialog.getByRole('button', { name: 'บันทึก', exact: true }).click(),
      ])
      menuId = (await created.json()).id
      await expect(dialog).toHaveCount(0)
      await expect(page.getByText(`เพิ่มเมนู ${name} แล้ว`)).toBeVisible()
      await expect(card).toContainText('฿65')
    })

    await test.step('ลูกค้าเห็นเมนูใหม่และตัวเลือก', async () => {
      await customer.goto(`/t/${session.token}`)
      const link = customer.getByRole('link', { name })
      await expect(link).toContainText('฿65')
      await link.click()
      const option = customer.locator('label').filter({ hasText: optionName })
      await expect(option).toContainText('+฿15')
      await expect(option.getByRole('checkbox')).toHaveCount(1)
    })

    await test.step('แก้ราคา → ลูกค้าเห็นราคาใหม่', async () => {
      await card.getByRole('button', { name: 'แก้ไข' }).click()
      const dialog = page.getByRole('dialog', { name: `แก้ไข ${name}` })
      await dialog.getByLabel(/ราคา \(บาท\)/).fill('70')
      await dialog.getByRole('button', { name: 'บันทึกข้อมูลเมนู' }).click()
      await expect(page.getByText(`บันทึก ${name} แล้ว`)).toBeVisible()
      await expect(card).toContainText('฿70')

      await customer.goto(`/t/${session.token}`)
      await expect(customer.getByRole('link', { name })).toContainText('฿70')
    })

    await test.step('ลบเมนู → หายทั้งหน้า Manage และหน้าลูกค้า', async () => {
      await card.getByRole('button', { name: 'แก้ไข' }).click()
      await page.getByRole('dialog', { name: `แก้ไข ${name}` }).getByRole('button', { name: 'ลบเมนูนี้' }).click()
      const confirm = page.getByRole('dialog', { name: 'ลบเมนู' })
      await expect(confirm).toContainText(name)
      await confirm.getByRole('button', { name: 'ลบเมนู', exact: true }).click()
      await expect(page.getByText(`ลบ ${name} แล้ว`)).toBeVisible()
      await expect(card).toHaveCount(0)
      menuId = undefined

      await customer.reload()
      await expect(customer.getByRole('searchbox', { name: 'ค้นหาเมนูอาหาร' })).toBeVisible()
      await expect(customer.getByRole('link', { name })).toHaveCount(0)
    })
  } finally {
    await ctx.close()
    if (menuId) await call(request, 'DELETE', `/menu/${menuId}`, { token: t.ADMIN })
  }
})

// ทดสอบ: ADMIN เพิ่มวัตถุดิบจากแท็บวัตถุดิบ (ชื่อว่างเพิ่มไม่ได้) แล้วเห็นการ์ดพร้อมสวิตช์ "มีของ" และลบได้ด้วยกล่องยืนยัน
// วิธี: admin เปิด /employee/manage แท็บวัตถุดิบ → กด "เพิ่มวัตถุดิบ" ตอนช่องว่าง เช็กว่าไม่มีการยิง POST และช่องถูกติดว่าผิด → กรอกชื่อไม่ซ้ำแล้วเพิ่ม → เช็กการ์ดและสวิตช์มีของเปิดอยู่ → กด "ลบ" ยืนยันในกล่อง "ลบวัตถุดิบ" → การ์ดหาย และ GET /ingredients ไม่มีชื่อนี้แล้ว
test('ADMIN เพิ่มวัตถุดิบ → เห็นการ์ดพร้อมสวิตช์มีของ → ลบด้วยกล่องยืนยัน', async ({ page, request }) => {
  const t = await tokens(request)
  const name = uniqueName('ใบโหระพาทดสอบ')
  const posts: string[] = []
  page.on('request', (r) => {
    if (r.method() === 'POST' && new URL(r.url()).pathname === '/ingredients') posts.push(r.url())
  })

  await hideCallStaffAlerts(page)
  await loginAsAdmin(page, request)
  await page.goto('/employee/manage')
  await page.getByRole('button', { name: 'วัตถุดิบ', exact: true }).click()
  const field = page.getByLabel('ชื่อวัตถุดิบ')
  await page.getByRole('button', { name: 'เพิ่มวัตถุดิบ' }).click()
  await expect(field).toHaveAttribute('aria-invalid', 'true')
  expect(posts).toHaveLength(0)

  await field.fill(name)
  await page.getByRole('button', { name: 'เพิ่มวัตถุดิบ' }).click()
  const card = page.locator('article').filter({ has: page.getByText(name, { exact: true }) })
  await expect(card).toBeVisible()
  await expect(card.getByRole('switch', { name: `มีของ ${name}` })).toBeChecked()

  await card.getByRole('button', { name: 'ลบ', exact: true }).click()
  const confirm = page.getByRole('dialog', { name: 'ลบวัตถุดิบ' })
  await expect(confirm).toContainText(name)
  await confirm.getByRole('button', { name: 'ลบวัตถุดิบ' }).click()
  await expect(page.getByText(`ลบวัตถุดิบ ${name} แล้ว`)).toBeVisible()
  await expect(card).toHaveCount(0)

  const list = await (await call(request, 'GET', '/ingredients', { token: t.ADMIN })).json()
  expect(list.map((i: { name: string }) => i.name)).not.toContain(name)
})
