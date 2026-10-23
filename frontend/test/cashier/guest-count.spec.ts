import { test, expect } from '@playwright/test'
import { call, ok, openNewSession, tokens } from '../api/api-helpers'
import { loginAsStaff, pickFreeTable, tablesPageCard } from '../helpers'

// จำนวนลูกค้า: ระบุตอนเปิดโต๊ะ/ใน QR dialog → รวมใน Dashboard "ลูกค้าเข้าใช้บริการ"
// ยอดใน Dashboard เป็นของทั้งวัน (เทสอื่นเปิดโต๊ะพร้อมกันได้) จึงเทียบส่วนต่างของ guests.total เท่านั้น
// — เทสอื่นไม่ได้ระบุจำนวนลูกค้า ส่วน 2 เทสในไฟล์นี้รันต่อกันไม่ทับกัน
test.describe.configure({ mode: 'serial' })

interface Dashboard {
  guests: { total: number; tables: number; tablesWithoutCount: number }
}

const guestsToday = async (request: Parameters<typeof tokens>[0], adminToken: string) =>
  (await ok<Dashboard>(await call(request, 'GET', '/reports/dashboard', { token: adminToken }))).guests.total

test('API: ระบุตอนเปิดโต๊ะ + แก้ทีหลัง → ยอดลูกค้าวันนี้ใน Dashboard เปลี่ยนตาม', async ({ request }) => {
  const t = await tokens(request)
  const before = await guestsToday(request, t.ADMIN)

  const { session } = await openNewSession(request, t)
  await ok(await call(request, 'PATCH', `/table-sessions/${session.id}/guests`, { token: t.STAFF, data: { guestCount: 3 } }))
  expect(await guestsToday(request, t.ADMIN)).toBe(before + 3)

  // นับผิด แก้เป็น 5 — ยอดต้องเป็นค่าใหม่ ไม่ใช่บวกซ้ำ
  await ok(await call(request, 'PATCH', `/table-sessions/${session.id}/guests`, { token: t.STAFF, data: { guestCount: 5 } }))
  expect(await guestsToday(request, t.ADMIN)).toBe(before + 5)

  // ค่านอกช่วงไม่รับ
  const invalid = await call(request, 'PATCH', `/table-sessions/${session.id}/guests`, { token: t.STAFF, data: { guestCount: 0 } })
  expect(invalid.status()).toBe(400)

  await ok(await call(request, 'PATCH', `/table-sessions/${session.id}/close`, { token: t.STAFF }))
})

test('หน้าโต๊ะ: เปิดโต๊ะแล้วกดจำนวนลูกค้าใน QR dialog → บันทึกและนับใน Dashboard', async ({ page, request }) => {
  const t = await tokens(request)
  const before = await guestsToday(request, t.ADMIN)

  await loginAsStaff(page, request)
  await page.goto('/employee/tables')
  const tableCardText = await pickFreeTable(page)
  await tablesPageCard(page, tableCardText).getByRole('button', { name: 'เปิดโต๊ะ + สร้าง QR' }).click()

  const qrDialog = page.getByRole('dialog', { name: /^QR โต๊ะ/ })
  await expect(qrDialog).toBeVisible()
  const guests = qrDialog.getByRole('group', { name: /จำนวนลูกค้า/ })
  await guests.getByRole('button', { name: '4', exact: true }).click()
  await expect(guests.getByRole('button', { name: '4', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await expect(qrDialog.getByText('บันทึกแล้ว 4 คน')).toBeVisible()
  await page.keyboard.press('Escape')

  expect(await guestsToday(request, t.ADMIN)).toBe(before + 4)

  // เก็บกวาด: ปิดโต๊ะที่เพิ่งเปิด (ยังไม่มีออเดอร์) ให้เทสอื่นได้ใช้โต๊ะว่าง
  const sessions = await ok<{ id: string; table: { number: number } }[]>(
    await call(request, 'GET', '/table-sessions?status=OPEN', { token: t.STAFF }),
  )
  const opened = sessions.find((s) => `โต๊ะ ${s.table.number}` === tableCardText)
  if (opened) await call(request, 'PATCH', `/table-sessions/${opened.id}/close`, { token: t.STAFF })
})
