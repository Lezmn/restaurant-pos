import { test, expect, type APIRequestContext } from '@playwright/test'
import { API_URL, loginAsAdmin, loginAsKitchen, loginViaApi } from '../helpers'

// ⚠️ ต้องรัน backend จริง + seed data (DB ทดสอบเท่านั้น — อัปโหลดรูปจริงลงโฟลเดอร์ uploads)
// รูปวัตถุดิบ: ADMIN เพิ่ม/เอาออกได้ในแท็บวัตถุดิบ ครัวเห็นรูปแต่เปลี่ยนไม่ได้

// PNG 2×2 สีส้ม — เล็กพอให้ resizeImage ฝั่งเว็บย่อ/แปลงได้
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAEklEQVR4nGP438Pwv4eBAUIBAC8+Bi0CBRbsAAAAAElFTkSuQmCC',
  'base64',
)

async function api(request: APIRequestContext, role: 'admin' | 'kitchen') {
  const { accessToken } = await loginViaApi(request, role, 'ChangeMe123!')
  return { Authorization: `Bearer ${accessToken}` }
}

/** วัตถุดิบใหม่ชื่อไม่ซ้ำ — ไม่ไปแตะรูปของวัตถุดิบจาก seed */
async function newIngredient(request: APIRequestContext) {
  const name = `วัตถุดิบรูป ${Date.now().toString(36)}`
  const res = await request.post(`${API_URL}/ingredients`, { headers: await api(request, 'admin'), data: { name } })
  expect(res.status()).toBe(201)
  return (await res.json()) as { id: string; name: string }
}

test('ADMIN เพิ่มรูปวัตถุดิบจากเครื่อง แล้วเอารูปออกได้', async ({ page, request }) => {
  const ingredient = await newIngredient(request)
  await loginAsAdmin(page, request)
  await page.goto('/employee/manage')
  await page.getByRole('button', { name: 'วัตถุดิบ', exact: true }).click()

  const card = page.locator('article').filter({ hasText: ingredient.name })
  await card.getByLabel(`เพิ่มรูป ${ingredient.name}`).setInputFiles({ name: 'egg.png', mimeType: 'image/png', buffer: PNG })
  await expect(card.getByRole('img', { name: `รูป ${ingredient.name}` })).toBeVisible()
  await expect(card.getByLabel(`เปลี่ยนรูป ${ingredient.name}`)).toBeAttached()

  // รีเฟรชแล้วรูปยังอยู่ (บันทึกใน DB)
  await page.reload()
  await page.getByRole('button', { name: 'วัตถุดิบ', exact: true }).click()
  await expect(card.getByRole('img', { name: `รูป ${ingredient.name}` })).toBeVisible()

  await card.getByRole('button', { name: 'เอารูปออก' }).click()
  await expect(card.getByRole('img', { name: `รูป ${ingredient.name}` })).toHaveCount(0)
  await expect(card.getByLabel(`เพิ่มรูป ${ingredient.name}`)).toBeAttached()
})

test('ครัวเห็นรูปวัตถุดิบแต่ไม่มีปุ่มเปลี่ยน และ API ตอบ 403 ถ้าพยายามเปลี่ยนรูป', async ({ page, request }) => {
  const ingredient = await newIngredient(request)
  const admin = await api(request, 'admin')
  const kitchen = await api(request, 'kitchen')
  const imageUrl = 'https://example.com/egg.webp'
  expect((await request.patch(`${API_URL}/ingredients/${ingredient.id}`, { headers: admin, data: { imageUrl } })).status()).toBe(200)

  // ครัวเปิด/ปิดของได้ แต่เปลี่ยนรูปไม่ได้
  expect(
    (await request.patch(`${API_URL}/ingredients/${ingredient.id}`, { headers: kitchen, data: { imageUrl: null } })).status(),
  ).toBe(403)
  expect(
    (await request.patch(`${API_URL}/ingredients/${ingredient.id}`, { headers: kitchen, data: { isAvailable: false } })).status(),
  ).toBe(200)

  await loginAsKitchen(page, request)
  await page.goto('/employee/manage')
  await page.getByRole('button', { name: 'วัตถุดิบ', exact: true }).click()
  const card = page.locator('article').filter({ hasText: ingredient.name })
  await expect(card).toBeVisible()
  await expect(card.getByLabel(/เพิ่มรูป|เปลี่ยนรูป/)).toHaveCount(0)
  await expect(card.getByRole('button', { name: 'เอารูปออก' })).toHaveCount(0)
})

test('ลิงก์รูปต้องเป็น http(s) หรือรูปที่อัปโหลดไว้', async ({ request }) => {
  const ingredient = await newIngredient(request)
  const admin = await api(request, 'admin')
  const res = await request.patch(`${API_URL}/ingredients/${ingredient.id}`, {
    headers: admin,
    data: { imageUrl: 'javascript:alert(1)' },
  })
  expect(res.status()).toBe(400)
})
