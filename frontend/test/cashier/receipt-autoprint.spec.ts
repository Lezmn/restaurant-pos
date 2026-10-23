import { test, expect, type Page } from '@playwright/test'
import {
  advanceOrderToServed,
  checkTableTile,
  loginAsAdmin,
  loginAsCashier,
  openTableAndPlaceOrder,
  paidBillsTable,
} from '../helpers'

// พิมพ์ใบเสร็จทันทีหลังรับเงิน (ค่าของเครื่องนี้ใน localStorage) — docs/PRINTING.md
// แทน window.print ด้วยตัวนับ (กล่องพิมพ์จริงของเบราว์เซอร์ทดสอบไม่ได้) ก่อนหน้าเว็บโหลด

const FRIED_RICE = /^ข้าวผัด(?!กะเพรา)/

async function countPrints(page: Page) {
  await page.addInitScript(() => {
    ;(window as unknown as { __prints: number }).__prints = 0
    window.print = () => {
      ;(window as unknown as { __prints: number }).__prints++
    }
  })
}

const prints = (page: Page) => page.evaluate(() => (window as unknown as { __prints: number }).__prints)

/** เปิดโต๊ะ + สั่ง + เสิร์ฟ แล้วสลับเป็นแคชเชียร์มารับเงินสดเต็มยอด → คืนชื่อโต๊ะ */
async function payOneTable(page: Page, request: Parameters<typeof loginAsAdmin>[1]) {
  await loginAsAdmin(page, request)
  const { tableCardText, orderRef } = await openTableAndPlaceOrder(page, FRIED_RICE)
  await advanceOrderToServed(page, orderRef)
  await loginAsCashier(page, request)
  return tableCardText.replace(/^โต๊ะ\s*/, '')
}

test('เครื่องที่เปิด "พิมพ์ทันที" → รับเงินเสร็จสั่งพิมพ์ 1 ครั้ง, เปิดใบเสร็จย้อนหลังไม่พิมพ์เอง', async ({
  page,
  request,
}) => {
  await countPrints(page)
  const tableName = await payOneTable(page, request)
  await page.evaluate(() => localStorage.setItem('restaurant.autoPrintReceipt', '1'))
  await page.goto('/employee/check')

  await checkTableTile(page, tableName).getByRole('button', { name: /^รับเงิน/ }).click()
  await page.getByRole('dialog', { name: `รับเงิน โต๊ะ ${tableName}` }).getByRole('button', { name: /^รับเงิน ฿/ }).click()

  const receipt = page.getByRole('dialog', { name: 'ใบเสร็จรับเงิน' })
  await expect(receipt).toBeVisible()
  await expect(receipt.getByLabel(/พิมพ์ใบเสร็จทันทีหลังรับเงิน/)).toBeChecked()
  await expect.poll(() => prints(page)).toBe(1)
  // หาแถวจากเลขที่ใบเสร็จ — โต๊ะเดียวกันอาจมีบิลอื่นของวันนี้อยู่แล้ว (รันซ้ำ/เทสอื่น)
  const receiptNo = (await receipt.getByText(/^RCPT-/).innerText()).trim()
  await receipt.getByRole('button', { name: 'ปิด' }).click()

  // ดูใบเสร็จย้อนหลังจากตารางบิลวันนี้ → ไม่สั่งพิมพ์เพิ่ม (กดปุ่มพิมพ์เองถ้าต้องการ)
  await paidBillsTable(page)
    .getByRole('row')
    .filter({ hasText: receiptNo })
    .getByRole('button', { name: 'ใบเสร็จ', exact: true })
    .click()
  await expect(receipt).toBeVisible()
  await receipt.getByRole('button', { name: 'พิมพ์ใบเสร็จ' }).click()
  await expect.poll(() => prints(page)).toBe(2)
})

test('เครื่องที่ไม่ได้เปิด → รับเงินแล้วไม่พิมพ์เอง, ติ๊กแล้วจำค่าไว้ใช้ใบถัดไป', async ({ page, request }) => {
  await countPrints(page)
  const tableName = await payOneTable(page, request)
  await page.goto('/employee/check')

  await checkTableTile(page, tableName).getByRole('button', { name: /^รับเงิน/ }).click()
  await page.getByRole('dialog', { name: `รับเงิน โต๊ะ ${tableName}` }).getByRole('button', { name: /^รับเงิน ฿/ }).click()

  const receipt = page.getByRole('dialog', { name: 'ใบเสร็จรับเงิน' })
  await expect(receipt).toBeVisible()
  const autoPrint = receipt.getByLabel(/พิมพ์ใบเสร็จทันทีหลังรับเงิน/)
  await expect(autoPrint).not.toBeChecked()

  await autoPrint.check()
  expect(await page.evaluate(() => localStorage.getItem('restaurant.autoPrintReceipt'))).toBe('1')
  // ติ๊กตอนกล่องเปิดอยู่ = มีผลใบถัดไป ไม่พิมพ์ใบนี้ย้อนหลัง
  expect(await prints(page)).toBe(0)
})
