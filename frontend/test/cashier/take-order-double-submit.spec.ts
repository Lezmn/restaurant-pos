import { test, expect } from '@playwright/test'
import { loginAsCashier, tablesPageCard } from '../helpers'

// ⚠️ ยิง backend จริง — เปิดโต๊ะ 1 โต๊ะและสร้างออเดอร์ค้างไว้ 1 ใบ (DB ทดสอบเท่านั้น)

test('STAFF กด "ส่งเข้าครัว" สองครั้งติด (double-click) ต้องได้ออเดอร์เดียว ไม่คิดเงินซ้ำ', async ({
  page,
  request,
}) => {
  await loginAsCashier(page, request)
  await page.goto('/employee/tables')

  const availableTable = page.locator('article', { hasText: 'ว่าง' }).first()
  await expect(availableTable).toBeVisible()
  const tableCardText = (await availableTable.locator('p.text-xl').innerText()).trim()

  await availableTable.getByRole('button', { name: 'เปิดโต๊ะ + สร้าง QR' }).click()
  const qrDialog = page.getByRole('dialog', { name: /^QR โต๊ะ/ })
  await expect(qrDialog).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(qrDialog).toHaveCount(0)

  await tablesPageCard(page, tableCardText)
    .getByRole('button', { name: 'รับออเดอร์แทนลูกค้า' })
    .click()
  const orderDialog = page.getByRole('dialog')
  await orderDialog
    .getByRole('listitem')
    .filter({ hasText: /น้ำเปล่า/ })
    .first()
    .getByRole('button', { name: '+ เพิ่ม' })
    .click()

  // นับ POST /orders ที่สำเร็จจริง แทนการไปนับในหน้า Check
  let created = 0
  page.on('response', (res) => {
    if (res.url().endsWith('/orders') && res.request().method() === 'POST' && res.status() === 201) {
      created++
    }
  })

  await orderDialog.getByRole('button', { name: 'ส่งเข้าครัว' }).dblclick()
  await expect(orderDialog).not.toBeVisible()
  await page.waitForTimeout(1500)
  expect(created).toBe(1)
})
