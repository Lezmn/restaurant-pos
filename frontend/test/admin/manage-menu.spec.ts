import { test, expect } from '@playwright/test'
import { loginAsAdmin } from '../helpers'

// ⚠️ ต้องรัน backend จริง + seed data ที่ localhost:3000
// เทสในไฟล์นี้เป็น read-only ทั้งหมด (ไม่กด "+ เพิ่มเมนู" / "+ เพิ่มวัตถุดิบ" จริง)
// เพื่อไม่ให้สร้างข้อมูลขยะค้างในฐานข้อมูล dev ทุกครั้งที่รันเทส

// ปุ่ม "+ เพิ่มหมวดหมู่" ถูกถอดออกแล้ว (เหลือแถบชิปกรองตามหมวด) — หมวดหมู่มาจาก seed
test('หน้าจัดการเมนูมีเครื่องมือครบ: เพิ่มเมนู, ค้นหา, สลับแท็บ', async ({
  page,
  request,
}) => {
  await loginAsAdmin(page, request)
  await page.goto('/employee/manage')

  await expect(page.getByRole('button', { name: '+ เพิ่มเมนู' })).toBeVisible()
  await expect(page.getByPlaceholder('ค้นหา')).toBeVisible()
  await expect(page.getByRole('button', { name: 'เมนู', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'วัตถุดิบ', exact: true })).toBeVisible()
})

test('เห็นหมวดหมู่จาก seed ครบ (อาหารจานเดียว, เมนูเส้น, เครื่องดื่ม)', async ({
  page,
  request,
}) => {
  await loginAsAdmin(page, request)
  await page.goto('/employee/manage')

  await expect(page.getByRole('button', { name: /^ทั้งหมด \(\d+\)$/ })).toBeVisible()
  await expect(page.getByRole('button', { name: /อาหารจานเดียว/ })).toBeVisible()
  await expect(page.getByRole('button', { name: /เมนูเส้น/ })).toBeVisible()
  await expect(page.getByRole('button', { name: /เครื่องดื่ม/ })).toBeVisible()
})

// backend มี model วัตถุดิบแล้ว (23 ก.ย.) — แท็บนี้เป็นหน้าจัดการวัตถุดิบจริง
test('กดแท็บ "วัตถุดิบ" แสดงหน้าจัดการวัตถุดิบ พร้อมวัตถุดิบจาก seed', async ({
  page,
  request,
}) => {
  await loginAsAdmin(page, request)
  await page.goto('/employee/manage')

  await page.getByRole('button', { name: 'วัตถุดิบ', exact: true }).click()

  await expect(page.getByRole('button', { name: '+ เพิ่มวัตถุดิบ' })).toBeVisible()
  await expect(page.getByText('หมู', { exact: true }).first()).toBeVisible()
})
