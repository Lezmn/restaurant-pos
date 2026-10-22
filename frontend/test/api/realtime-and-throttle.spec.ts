import { expect, test } from '@playwright/test'
import { io, type Socket } from 'socket.io-client'
import { API_URL, call, customerOrder, menuItemByName, openNewSession, tokens, type Role } from './api-helpers'

// ⚠️ ยิง backend จริง — DB ทดสอบเท่านั้น

function connect(auth: Record<string, string>) {
  return new Promise<Socket>((resolve, reject) => {
    const socket = io(API_URL, { auth, transports: ['websocket'], reconnection: false })
    const timer = setTimeout(() => reject(new Error('socket connect timeout')), 5000)
    socket.on('connect', () => {
      // server ตัดทิ้งหลัง handshake ถ้าตรวจไม่ผ่าน — รอดูสักพักว่าโดนตัดไหม
      setTimeout(() => {
        clearTimeout(timer)
        if (socket.connected) resolve(socket)
        else reject(new Error('disconnected by server'))
      }, 400)
    })
    socket.on('connect_error', (e) => {
      clearTimeout(timer)
      reject(e)
    })
  })
}

function collect(socket: Socket, event: string) {
  const got: unknown[] = []
  socket.on(event, (payload) => got.push(payload))
  return got
}

test.describe('Socket.IO', () => {
  let t: Record<Role, string>
  test.beforeAll(async ({ request }) => {
    t = await tokens(request)
  })

  test('order.created ไปถึงห้อง staff และห้อง session ของโต๊ะนั้นเท่านั้น', async ({ request }) => {
    const water = await menuItemByName(request, 'น้ำเปล่า')
    const a = await openNewSession(request, t)
    const b = await openNewSession(request, t)
    const staff = await connect({ token: t.KITCHEN })
    const custA = await connect({ sessionToken: a.session.token })
    const custB = await connect({ sessionToken: b.session.token })
    try {
      const staffGot = collect(staff, 'order.created')
      const aGot = collect(custA, 'order.created')
      const bGot = collect(custB, 'order.created')
      const order = await customerOrder(request, a.session.token, [{ menuItemId: water.id, quantity: 1 }])
      await expect.poll(() => staffGot.length).toBeGreaterThan(0)
      await expect.poll(() => aGot.length).toBe(1)
      await new Promise((r) => setTimeout(r, 500))
      expect(bGot).toHaveLength(0)
      expect(aGot[0]).toMatchObject({ id: order.id, tableSessionId: a.session.id })
      // payload ไม่ควรแนบข้อมูลก้อนใหญ่ (เช่นรายการอาหาร)
      expect(Object.keys(aGot[0] as object).sort()).toEqual(['id', 'status', 'tableId', 'tableSessionId'])
    } finally {
      staff.close()
      custA.close()
      custB.close()
    }
  })

  test('service-request.created (เรียกพนักงาน) ถึงห้อง staff', async ({ request }) => {
    const a = await openNewSession(request, t)
    const staff = await connect({ token: t.STAFF })
    try {
      const got = collect(staff, 'service-request.created')
      await call(request, 'POST', '/public/call-staff', { data: { sessionToken: a.session.token } })
      await expect.poll(() => got.length).toBeGreaterThan(0)
      expect(got.some((p) => (p as { tableSessionId: string }).tableSessionId === a.session.id)).toBe(true)
    } finally {
      staff.close()
    }
  })

  test('menu.updated ถึงลูกค้าทุกโต๊ะเมื่อครัวปิดวัตถุดิบ', async ({ request }) => {
    const ingredients = await (await call(request, 'GET', '/ingredients', { token: t.KITCHEN })).json()
    const ing = ingredients[0]
    const a = await openNewSession(request, t)
    const cust = await connect({ sessionToken: a.session.token })
    try {
      const got = collect(cust, 'menu.updated')
      await call(request, 'PATCH', `/ingredients/${ing.id}`, { token: t.KITCHEN, data: { isAvailable: ing.isAvailable } })
      await expect.poll(() => got.length).toBeGreaterThan(0)
    } finally {
      cust.close()
    }
  })

  test('handshake ไม่มี token / token ผิด / QR ปิดแล้ว → ถูกตัด', async () => {
    await expect(connect({})).rejects.toThrow()
    await expect(connect({ token: 'not-a-jwt' })).rejects.toThrow()
    await expect(connect({ sessionToken: 'demo-table-1-paid-session' })).rejects.toThrow()
  })
})

// ต้องรัน API อีกตัวที่ใช้ LOGIN_THROTTLE_LIMIT ค่า default (5) แล้วชี้ด้วย E2E_THROTTLED_API_URL
test('login เกิน 5 ครั้ง/นาที/IP → 429', async ({ request }) => {
  const url = process.env.E2E_THROTTLED_API_URL
  test.skip(!url, 'ไม่ได้ตั้ง E2E_THROTTLED_API_URL')
  const statuses: number[] = []
  for (let i = 0; i < 7; i++) {
    const res = await request.post(`${url}/auth/login`, {
      data: { email: 'nobody@restaurant.local', password: 'wrong-password' },
    })
    statuses.push(res.status())
  }
  expect(statuses.slice(0, 5).every((s) => s === 401)).toBe(true)
  expect(statuses.slice(5)).toEqual([429, 429])
  // endpoint อื่นของคนเดียวกันยังใช้ได้ (ไม่ได้บล็อกทั้งแอป)
  expect((await request.get(`${url}/public/menu`)).status()).toBe(200)
})
