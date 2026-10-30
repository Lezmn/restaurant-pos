import { test, expect } from '@playwright/test'
import { loginAsAdmin } from '../helpers'

// ⚠️ ต้องรัน backend จริง + seed data ที่ localhost:3000

// ทดสอบ: ADMIN เห็นแถบเมนูพนักงานครบทั้ง 5 หน้า (คิวครัว, รับเงิน, เมนู/ของหมด, โต๊ะ, กลับบ้าน)
// วิธี: login เป็น admin → เปิด /employee/order → เช็กว่าทั้ง 5 เป็นลิงก์ (แถบเมนูแสดงเฉพาะหน้าที่ role นั้นเข้าได้)
test('แถบเมนูของ admin มีครบทั้ง 5 หน้า (คิวครัว, รับเงิน, เมนู/ของหมด, โต๊ะ, กลับบ้าน)', async ({
  page,
  request,
}) => {
  await loginAsAdmin(page, request)
  await page.goto('/employee/order')

  // แถบเมนู (แถบซ้ายบนแท็บเล็ต/คอม) แสดงเฉพาะหน้าที่ role นั้นเปิดได้ — ADMIN ต้องเห็นครบ
  await expect(page.getByRole('link', { name: 'คิวครัว', exact: true })).toBeVisible()
  await expect(page.getByRole('link', { name: 'รับเงิน', exact: true })).toBeVisible()
  await expect(page.getByRole('link', { name: 'เมนู/ของหมด', exact: true })).toBeVisible()
  await expect(page.getByRole('link', { name: 'โต๊ะ', exact: true })).toBeVisible()
  await expect(page.getByRole('link', { name: 'กลับบ้าน', exact: true })).toBeVisible()
})

// ทดสอบ: ADMIN เห็นปุ่มเสียงแจ้งเตือนและลิงก์ "Dashboard" ที่ header ปุ่ม "ออกจากระบบ" ท้ายแถบเมนู และไม่มีลิงก์ "โต๊ะ / QR" แล้ว
// วิธี: login เป็น admin → เปิด /employee/order → เช็กลิงก์/ปุ่ม
test('admin เห็นลิงก์ "Dashboard" ที่ header และปุ่ม "ออกจากระบบ" ในแถบเมนู', async ({ page, request }) => {
  await loginAsAdmin(page, request)
  await page.goto('/employee/order')

  // ปุ่มเสียงย้ายจากจอครัวมาอยู่ที่หัวจอ (ข้าง Dashboard) — กดได้ทุกหน้า
  await expect(page.getByRole('button', { name: 'เสียงแจ้งเตือนเปิดอยู่ (แตะเพื่อปิด)' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Dashboard' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'ออกจากระบบ' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'โต๊ะ / QR' })).toHaveCount(0)
})

// ทดสอบ: แถบด้านบนบอกว่า login อยู่ด้วยบัญชีไหน (บัญชีกลางตามตำแหน่ง — ชื่อเต็มอยู่ใน title ของป้าย)
// วิธี: login เป็น admin → เปิด /employee/order → เช็กป้าย "เจ้าของร้าน" ที่มีชื่อบัญชีเป็น title
test('header แสดงบัญชีของ admin ที่ login อยู่', async ({ page, request }) => {
  await loginAsAdmin(page, request)
  await page.goto('/employee/order')

  await expect(page.getByTitle('Admin')).toHaveText('เจ้าของร้าน')
})
