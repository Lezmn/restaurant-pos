import { test, expect, type Page } from '@playwright/test'
import { loginAsAdmin } from '../helpers'

// ⚠️ ต้องรัน backend จริง + seed data (อ่านอย่างเดียว ไม่สร้างข้อมูล)
// หน้าเจ้าของร้านบนมือถือ: ตารางกลายเป็นรายการบนจอแคบ (ไม่ต้องเลื่อนข้าง) และข้อความ "ไม่มีข้อมูล" ต้องอยู่ในจอ
// เดิมตาราง Finance เลื่อนข้างจนคอลัมน์ยอดเงินหลุดจอ และหน้าปิดยอดจัดข้อความกลางตาราง 820px จนมองไม่เห็น
test.use({ viewport: { width: 375, height: 812 } })
test.describe.configure({ timeout: 60_000 })

const pageWidth = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth)

// ทดสอบ: หน้า Finance บนมือถือ ไม่เลื่อนข้าง และยอดเงินของแต่ละรายการอยู่ในจอ
// วิธี: admin เปิด /owner/finance ที่ 375px → เช็กความกว้างหน้า → แถวแรกที่มียอด ช่องยอดต้องอยู่ในขอบจอ
test('Finance บนมือถือ: รายการไม่เลื่อนข้าง ยอดเงินอยู่ในจอ', async ({ page, request }) => {
  await loginAsAdmin(page, request)
  await page.goto('/owner/finance')

  const row = page.locator('tbody tr').filter({ hasText: '฿' }).first()
  await expect(row).toBeVisible({ timeout: 10_000 })
  expect(await pageWidth(page)).toBeLessThanOrEqual(375)

  const amount = row.locator('td').nth(3)
  const box = await amount.boundingBox()
  expect(box).not.toBeNull()
  expect(box!.x + box!.width).toBeLessThanOrEqual(375)
})

// ทดสอบ: หน้าปิดยอดบนมือถือ เดือนที่ยังไม่ปิดยอด ต้องเห็นข้อความ "ยังไม่มีการปิดยอด" ในจอ และการ์ดสรุปไม่ขึ้น "ตรง" สีเขียว
// วิธี: เปิด /owner/cash-closes ที่ 375px → เลือกเดือนเก่าที่ไม่มีข้อมูล (ม.ค. 2025) → เช็กข้อความว่างอยู่ในจอ ไม่เลื่อนข้าง และการ์ดเป็น "-"
test('ปิดยอดบนมือถือ: เดือนที่ไม่มีข้อมูลเห็นข้อความว่างในจอ และการ์ดไม่ขึ้น "ตรง"', async ({ page, request }) => {
  await loginAsAdmin(page, request)
  await page.goto('/owner/cash-closes')
  await page.getByLabel('เดือน').fill('2025-01')

  await expect(page.getByText('ยังไม่มีการปิดยอดในเดือนนี้', { exact: true })).toBeInViewport({ timeout: 10_000 })
  expect(await pageWidth(page)).toBeLessThanOrEqual(375)
  await expect(page.getByText('ตรง', { exact: true })).toHaveCount(0)
})
