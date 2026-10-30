import { test, expect, devices } from '@playwright/test'
import { call, createIngredient, createMenu, openNewSession, tokens, uniqueName } from '../api/api-helpers'
import { loginAsKitchen } from '../helpers'

// ⚠️ ต้องรัน backend จริง + seed data (DB ทดสอบเท่านั้น — สร้างเมนู/วัตถุดิบ/โต๊ะจริง)
// ปุ่ม "ปิดเมนูที่หมด" บนจอครัว (KitchenSoldOut.tsx): ปิดเมนูหรือวัตถุดิบได้ทันทีโดยไม่ต้องสลับไปหน้า Manage
// ใช้เมนู/วัตถุดิบที่เทสต์สร้างเอง — ปิดของ seed จะทำให้เทสต์อื่นที่สั่งพร้อมกันพัง
test.describe.configure({ timeout: 60_000 })

// ทดสอบ: ครัวกด "ปิดเมนูที่หมด" ปิดเมนู → ลูกค้าที่เปิดหน้าเมนูค้างไว้เห็นเมนูหายเอง, ปิดวัตถุดิบ → ตัวเลือกที่ใช้วัตถุดิบนั้นขึ้น "หมด" กดเลือกไม่ได้ แล้วเปิดคืนได้ทั้งคู่
// วิธี: admin สร้างวัตถุดิบ + เมนู A (ไม่มีตัวเลือก) + เมนู B (ตัวเลือกเพิ่มเติมผูกวัตถุดิบ) ผ่าน API → มือถือลูกค้าเปิดเมนูรอไว้ → ครัวเปิดบอร์ด กด "ปิดเมนูที่หมด" ค้นหาเมนู A กดเป็นหมด → เช็กปุ่มขึ้น "หมด" และเมนู A หายจากมือถือ (ไม่ refresh) → แท็บวัตถุดิบกดปิดวัตถุดิบ → ลูกค้าเปิดหน้าเมนู B เห็นตัวเลือกขึ้น "หมด" ไม่มีช่องติ๊ก → ครัวเปิดคืนทั้งคู่ → เมนู A กลับมา และตัวเลือกเลือกได้อีก → ลบข้อมูลทดสอบ (ใน finally)
test('ครัวกด "ปิดเมนูที่หมด": ปิดเมนู → ลูกค้าเห็นเมนูหาย · ปิดวัตถุดิบ → ตัวเลือกขึ้น "หมด" แล้วเปิดคืนได้', async ({
  browser,
  page,
  request,
}) => {
  const t = await tokens(request)
  const ingredient = await createIngredient(request, t.ADMIN, uniqueName('ท็อปปิ้งครัว'))
  const menuA = await createMenu(request, t.ADMIN, { name: uniqueName('เมนูหมดครัว'), price: 39 })
  const optionName = uniqueName('ไข่ออนเซ็น')
  const menuB = await createMenu(request, t.ADMIN, {
    name: uniqueName('เมนูตัวเลือกหมด'),
    price: 45,
    options: [{ name: optionName, price: 10, group: 'EXTRA', ingredientId: ingredient.id }],
  })
  const { session } = await openNewSession(request, t)

  const ctx = await browser.newContext({ ...devices['iPhone 13'], viewport: { width: 375, height: 812 } })
  const customer = await ctx.newPage()
  try {
    await customer.goto(`/t/${session.token}`)
    const linkA = customer.getByRole('link', { name: menuA.name })
    await expect(linkA).toBeVisible()

    await loginAsKitchen(page, request)
    await page.goto('/employee/order')
    await page.getByRole('button', { name: /ปิดเมนูที่หมด/ }).click()
    const dialog = page.getByRole('dialog', { name: 'ของหมด' })
    await expect(dialog.getByRole('tab', { name: 'เมนู' })).toHaveAttribute('aria-selected', 'true')

    await test.step('ปิดเมนู A → หายจากหน้าลูกค้าที่เปิดค้างไว้', async () => {
      await dialog.getByPlaceholder('ค้นหาเมนู').fill(menuA.name)
      await dialog.getByRole('button', { name: `${menuA.name}: ขายอยู่ แตะเพื่อปิดเป็นหมด` }).click()
      const off = dialog.getByRole('button', { name: `${menuA.name}: หมดอยู่ แตะเพื่อเปิดขาย` })
      await expect(off).toHaveAttribute('aria-pressed', 'true')
      await expect(off).toHaveText('หมด')
      await expect(linkA).toHaveCount(0, { timeout: 10_000 })
    })

    await test.step('ปิดวัตถุดิบ → ตัวเลือกของเมนู B ขึ้น "หมด" กดเลือกไม่ได้', async () => {
      await dialog.getByRole('tab', { name: 'วัตถุดิบ' }).click()
      await dialog.getByPlaceholder('ค้นหาวัตถุดิบ').fill(ingredient.name)
      await dialog.getByRole('button', { name: `${ingredient.name}: ขายอยู่ แตะเพื่อปิดเป็นหมด` }).click()
      await expect(dialog.getByRole('button', { name: `${ingredient.name}: หมดอยู่ แตะเพื่อเปิดขาย` })).toHaveAttribute(
        'aria-pressed',
        'true',
      )

      await customer.goto(`/t/${session.token}/menu/${menuB.id}`)
      const option = customer.locator('label').filter({ hasText: optionName })
      await expect(option).toContainText('หมด')
      await expect(option.getByRole('checkbox')).toHaveCount(0)
    })

    await test.step('เปิดคืนทั้งคู่ → เมนู A กลับมา ตัวเลือกเลือกได้อีก', async () => {
      await dialog.getByRole('button', { name: `${ingredient.name}: หมดอยู่ แตะเพื่อเปิดขาย` }).click()
      await expect(dialog.getByRole('button', { name: `${ingredient.name}: ขายอยู่ แตะเพื่อปิดเป็นหมด` })).toBeVisible()
      await dialog.getByRole('tab', { name: 'เมนู' }).click()
      await dialog.getByPlaceholder('ค้นหาเมนู').fill(menuA.name)
      await dialog.getByRole('button', { name: `${menuA.name}: หมดอยู่ แตะเพื่อเปิดขาย` }).click()
      await expect(dialog.getByRole('button', { name: `${menuA.name}: ขายอยู่ แตะเพื่อปิดเป็นหมด` })).toBeVisible()

      await customer.reload()
      await expect(customer.locator('label').filter({ hasText: optionName }).getByRole('checkbox')).toHaveCount(1)
      await customer.goto(`/t/${session.token}`)
      await expect(customer.getByRole('link', { name: menuA.name })).toBeVisible()
    })
  } finally {
    await ctx.close()
    for (const id of [menuA.id, menuB.id]) await call(request, 'DELETE', `/menu/${id}`, { token: t.ADMIN })
    await call(request, 'DELETE', `/ingredients/${ingredient.id}`, { token: t.ADMIN })
  }
})
