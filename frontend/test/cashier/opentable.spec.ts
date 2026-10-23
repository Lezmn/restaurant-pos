import { test, expect } from '@playwright/test'
import { checkTableTile, loginAsCashier, pickFreeTable } from '../helpers'

// ⚠️ ต้องรัน backend จริง + seed data ที่ localhost:3000
// เดิมสมมติว่าโต๊ะว่างครบ 6 โต๊ะ แต่ seed มีโต๊ะเปิดค้างไว้เป็นตัวอย่าง (โต๊ะ 2, 4)
// และเทสอื่นก็เปิดโต๊ะทิ้งไว้ได้ — จึงนับ "ก่อน/หลัง" เทียบกันแทนการ hardcode จำนวน
// และเปิดโต๊ะว่างตัวแรก (ไม่ fix โต๊ะ 1) เปิดจริงผ่าน UI จึงปิดคืนท้ายเทส

test('cashier เปิดโต๊ะที่ 1 แล้วจำนวนโต๊ะว่างและรายการโต๊ะที่เปิดต้องถูกต้อง', async ({
  page,
  request,
}) => {
  // 1. login role Cashier
  await loginAsCashier(page, request)
  await page.goto('/employee/check')
  await expect(page).toHaveURL(/\/employee\/check$/)

  // 2. จำจำนวนโต๊ะว่างตอนเริ่มไว้เทียบ
  const availableText = page.getByText(/จำนวนโต๊ะที่ว่าง \d+ โต๊ะ/)
  await expect(availableText).toBeVisible()
  const before = Number((await availableText.innerText()).match(/\d+/)![0])

  // 3. กดปุ่ม โต๊ะ / QR
  await page.getByRole('link', { name: 'โต๊ะ / QR' }).click()
  await expect(page).toHaveURL(/\/employee\/tables$/)

  // 4. กดปุ่ม เปิดโต๊ะ + สร้าง QR ของโต๊ะว่างตัวแรก (เปิดสำเร็จจะเด้ง QR modal ขึ้นมาเอง)
  // สุ่มโต๊ะว่าง (หลาย worker เปิดโต๊ะพร้อมกัน ตัวแรกจะชนกัน)
  const tableCardText = await pickFreeTable(page)
  const tableName = tableCardText.replace(/^โต๊ะ\s*/, '')
  const table1Card = page
    .locator('article')
    .filter({ has: page.getByText(tableCardText, { exact: true }) })

  // ก่อนเปิดโต๊ะ badge สถานะต้องขึ้นว่า "ว่าง"
  await expect(table1Card.getByText('ว่าง', { exact: true })).toBeVisible()

  await table1Card.getByRole('button', { name: 'เปิดโต๊ะ + สร้าง QR' }).click()
  await expect(page.getByRole('dialog', { name: `QR โต๊ะ ${tableName}` })).toBeVisible()

  // เปิดโต๊ะสำเร็จแล้ว badge สถานะต้องเปลี่ยนเป็น "มีลูกค้า"
  await expect(table1Card.getByText('มีลูกค้า', { exact: true })).toBeVisible()

  // 5. กดปุ่ม Check 2 ครั้ง — ครั้งแรกโดน overlay ของ QR modal บังอยู่ เลยแค่ปิด modal
  // ครั้งที่สอง modal ปิดแล้วถึงกดปุ่มนำทางไปหน้า Check ได้จริง
  const checkTab = page.getByRole('link', { name: 'Check' })
  await checkTab.click({ force: true })
  await checkTab.click()

  // 6. ตรวจสอบว่าจำนวนโต๊ะว่างลดลง 1 และโต๊ะที่เพิ่งเปิดอยู่ในตารางโต๊ะที่เปิด
  await expect(page).toHaveURL(/\/employee\/check$/)
  await expect(page.getByText(`จำนวนโต๊ะที่ว่าง ${before - 1} โต๊ะ`)).toBeVisible()

  // โต๊ะที่เปิดอยู่แสดงเป็นการ์ด (หัวการ์ด "โต๊ะ {name}")
  await expect(checkTableTile(page, tableName)).toHaveCount(1)

  // เก็บกวาด: ปิดโต๊ะคืน (มี popup ยืนยัน) ให้จำนวนโต๊ะว่างกลับเท่าเดิม
  await page.goto('/employee/tables')
  await table1Card.getByRole('button', { name: 'ปิดโต๊ะ' }).click()
  await page.getByRole('dialog', { name: 'ปิดโต๊ะ' }).getByRole('button', { name: 'ปิดโต๊ะ' }).click()
  await expect(
    table1Card.getByRole('button', { name: 'เปิดโต๊ะ + สร้าง QR' }),
  ).toBeVisible()

  // ปิดโต๊ะแล้ว badge สถานะต้องกลับไปเป็น "ว่าง" เหมือนเดิม
  await expect(table1Card.getByText('ว่าง', { exact: true })).toBeVisible()
})
