import { test, expect, type Locator, type Page } from '@playwright/test'
import { uniqueName } from '../api/api-helpers'
import { loginAsAdmin } from '../helpers'

// ⚠️ ต้องรัน backend จริง + seed data (DB ทดสอบเท่านั้น — สร้าง/แก้/ลบรายจ่ายจริง)
// หน้า "ภาพรวมทางการเงิน" (/owner/finance): การ์ดเดือนนี้, เพิ่ม/แก้/ลบรายจ่าย, กรองหมวด, รายรับจากบิลแก้ที่นี่ไม่ได้
// ตัวเลขเทียบกับ response /reports/income-expense?month= ที่หน้าเว็บโหลดเอง (รอบล่าสุดหลังบันทึก)
// @totals-reports: รายจ่ายเปลี่ยนกำไรสุทธิของวัน — ไม่ให้ปนกับเทสต์ยอดในชุดหลัก
test.use({ viewport: { width: 1280, height: 900 } })
test.describe.configure({ timeout: 60_000 })

interface IncomeExpense {
  totalIncome: number
  totalExpense: number
  netProfit: number
  incomeByMethod: { CASH: number; PROMPTPAY: number }
  transactions: { type: 'INCOME' | 'EXPENSE' }[]
}

const baht = (n: number) =>
  new Intl.NumberFormat('th-TH', { style: 'currency', currency: 'THB', minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(n)

const statValue = (page: Page, label: string): Locator =>
  page
    .locator('div.rounded-xl.border-2')
    .filter({ has: page.getByText(label, { exact: true }) })
    .locator('> p')
    .first()

const isReport = (url: string) => url.includes('/reports/income-expense?month=')

async function expectCards(page: Page, r: IncomeExpense) {
  await expect(statValue(page, 'กำไรสุทธิ')).toHaveText(baht(r.netProfit))
  await expect(statValue(page, 'รายจ่าย')).toHaveText(baht(r.totalExpense))
  await expect(statValue(page, 'รายรับรวม')).toHaveText(baht(r.totalIncome))
  await expect(statValue(page, 'จ่ายเงินสด')).toHaveText(baht(r.incomeByMethod.CASH))
  await expect(statValue(page, 'จ่าย PromptPay')).toHaveText(baht(r.incomeByMethod.PROMPTPAY))
  await expect(statValue(page, 'จำนวนบิล')).toHaveText(
    r.transactions.filter((tx) => tx.type === 'INCOME').length.toLocaleString('th-TH'),
  )
}

/** ทำ action แล้วรอ POST/PATCH/DELETE /expenses สำเร็จ + หน้าเว็บโหลดรายงานรอบใหม่ คืนรายงานรอบนั้น */
async function saveAndReload(page: Page, method: string, action: () => Promise<unknown>) {
  const [, report] = await Promise.all([
    page.waitForResponse((r) => new URL(r.url()).pathname.startsWith('/expenses') && r.request().method() === method && r.ok()),
    page.waitForResponse((r) => isReport(r.url()) && r.ok()),
    action(),
  ])
  return (await report.json()) as IncomeExpense
}

// ทดสอบ: การ์ดเดือนนี้ตรงกับ API, เพิ่มรายจ่ายต้องกรอกครบและจำนวนเงินมากกว่า 0, เพิ่ม/แก้/ลบแล้วการ์ดกับตารางเปลี่ยนตาม, กรองหมวดได้ และรายรับจากบิลไม่มีปุ่มแก้/ลบ
// วิธี: admin เปิด /owner/finance ดัก response เทียบการ์ด → กด "+ รายจ่าย" ส่งฟอร์มว่าง/จำนวน 0 เช็กข้อความเตือน → กรอกรายละเอียดไม่ซ้ำ หมวดอุปกรณ์ 123.5 บาท บันทึก → เช็กการ์ดตาม response รอบใหม่ และแถวโชว์ -฿123.5 → กรองหมวดอุปกรณ์ เห็นแถวนี้ → แก้เป็น 200 → ลบ ยืนยัน → แถวหาย → กรองเงินสด แถวรายรับขึ้น "รายรับจากบิล" ไม่มีปุ่มแก้ไข (แท็ก @totals-reports)
test('หน้าการเงิน: การ์ดตรงกับ API · เพิ่ม/แก้/ลบรายจ่าย · กรองหมวด · รายรับจากบิลแก้ไม่ได้', { tag: '@totals-reports' }, async ({ page, request }) => {
  await loginAsAdmin(page, request)
  const first = page.waitForResponse((r) => isReport(r.url()) && r.ok())
  await page.goto('/owner/finance')
  await expect(page.getByRole('heading', { name: 'ภาพรวมทางการเงิน' })).toBeVisible()
  await expectCards(page, (await (await first).json()) as IncomeExpense)

  const detail = uniqueName('ซื้อหม้อ E2E')
  const row = page.getByRole('row').filter({ hasText: detail })

  await test.step('ฟอร์มเพิ่มรายจ่ายกันค่าผิด', async () => {
    await page.getByRole('button', { name: '+ รายจ่าย' }).click()
    const save = page.getByRole('button', { name: 'บันทึกรายจ่าย' })
    await save.click()
    await expect(page.getByRole('alert')).toHaveText('กรุณากรอกรายละเอียด')
    await page.getByPlaceholder('เช่น ซื้อวัตถุดิบจากตลาด').fill(detail)
    await page.getByLabel(/จำนวนเงิน \(บาท\)/).fill('0')
    await save.click()
    await expect(page.getByRole('alert')).toHaveText('จำนวนเงินต้องมากกว่า 0')
  })

  await test.step('เพิ่มรายจ่าย → การ์ดและตารางเปลี่ยน', async () => {
    await page.getByLabel('หมวดหมู่').selectOption({ label: 'อุปกรณ์' })
    await page.getByLabel(/จำนวนเงิน \(บาท\)/).fill('123.5')
    const report = await saveAndReload(page, 'POST', () => page.getByRole('button', { name: 'บันทึกรายจ่าย' }).click())
    await expect(page.getByRole('button', { name: 'บันทึกรายจ่าย' })).toHaveCount(0)
    await expectCards(page, report)
    await expect(row).toContainText('อุปกรณ์')
    await expect(row).toContainText(`-${baht(123.5)}`)
  })

  await test.step('กรองหมวดอุปกรณ์', async () => {
    await page.getByRole('button', { name: 'อุปกรณ์', exact: true }).click()
    await expect(row).toBeVisible()
    const others = page.locator('tbody tr').filter({ hasNotText: 'อุปกรณ์' })
    await expect(others).toHaveCount(0)
  })

  await test.step('แก้จำนวนเงิน', async () => {
    await row.getByRole('button', { name: 'แก้ไข' }).click()
    const dialog = page.getByRole('dialog', { name: 'แก้ไขรายจ่าย' })
    await dialog.getByLabel(/จำนวนเงิน \(บาท\)/).fill('200')
    const report = await saveAndReload(page, 'PATCH', () => dialog.getByRole('button', { name: 'บันทึกการแก้ไข' }).click())
    await expect(dialog).toHaveCount(0)
    await expect(row).toContainText(`-${baht(200)}`)
    await expectCards(page, report)
  })

  await test.step('ลบรายจ่าย', async () => {
    await row.getByRole('button', { name: 'ลบ', exact: true }).click()
    const dialog = page.getByRole('dialog', { name: 'ลบรายจ่าย' })
    await expect(dialog).toContainText(detail)
    const report = await saveAndReload(page, 'DELETE', () => dialog.getByRole('button', { name: 'ลบรายการนี้' }).click())
    await expect(row).toHaveCount(0)
    await expectCards(page, report)
  })

  await test.step('รายรับจากบิลแก้/ลบที่หน้านี้ไม่ได้', async () => {
    await page.getByRole('button', { name: 'เงินสด', exact: true }).click()
    const income = page.locator('tbody tr').first()
    await expect(income).toContainText('รายรับจากบิล')
    await expect(income.getByRole('button')).toHaveCount(0)
  })
})
