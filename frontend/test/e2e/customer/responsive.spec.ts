import { test, expect, devices, type Page, type Route, type TestInfo } from '@playwright/test'

// หน้าลูกค้า (สแกน QR) บนจอหลายขนาด — ไม่ต้องรัน backend และไม่สร้างข้อมูลจริง
// ทุกคำขอไป API ถูกตอบด้วยข้อมูลจำลองในไฟล์นี้ (page.route) จึงคุมเนื้อหาได้ เช่น ชื่อเมนูยาวมาก ๆ
// แต่ละขนาดจอ × แต่ละหน้า ตรวจ 4 อย่าง แล้วถ่ายภาพจอตอนต้นหน้าและท้ายหน้าเก็บไว้ดูด้วยตา (แนบในรายงาน + test-results/)
//   1. ไม่มีอะไรกว้างเกินจอจนต้องเลื่อนซ้าย-ขวา
//   2. เนื้อหาท้ายหน้าไม่ถูกแถบที่ติดขอบล่างจอบัง (แถบเมนูล่าง / แถบตะกร้า / แถบปุ่มเพิ่มรายการ)
//      และแถบพวกนั้นต้องชิดขอบล่างจอหรือวางบนแถบอื่นพอดี ไม่ลอยค้างกลางจอ
//   3. ข้อความยาวไม่ล้นกรอบ (ต้องตัดด้วย … หรือขึ้นบรรทัดใหม่)
//   4. ปุ่มกดด้วยนิ้วได้: เล็กกว่า 24px = ตก (WCAG 2.5.8) · เล็กกว่า 44px = บันทึกเป็นข้อสังเกตในรายงาน

const API_URL = process.env.E2E_API_URL ?? 'http://localhost:3000'
const TOKEN = 'responsive-demo-token'
const LONG_NAME = 'ข้าวผัดกะเพราหมูกรอบไข่ดาวไม่สุกเพิ่มพริกน้ำปลาพิเศษสูตรเด็ดของทางร้าน'
const LONG_NOTE = 'ไม่ใส่ผัก ไม่ใส่หอม ไม่เผ็ดเลย แยกน้ำซุป ใส่กล่องกลับบ้านด้วยนะคะ ขอบคุณค่ะ'

const option = (id: string, name: string, price: number, group: 'PROTEIN' | 'EXTRA') => ({
  id,
  name,
  price,
  group,
  isAvailable: true,
})
const proteins = [option('pork', 'หมู', 0, 'PROTEIN'), option('shrimp', 'กุ้ง', 20, 'PROTEIN'), option('chicken', 'ไก่', 0, 'PROTEIN')]
const item = (id: string, name: string, price: number, extra: Record<string, unknown> = {}) => ({
  id,
  name,
  price,
  imageUrl: null,
  isAvailable: true,
  options: [] as ReturnType<typeof option>[],
  ...extra,
})

const menu = [
  {
    id: 'cat-rice',
    name: 'อาหารจานเดียว',
    sortOrder: 0,
    menuItems: [
      item('m-rice', 'ข้าวผัด', 50, { options: [...proteins, option('egg', 'ไข่ดาว', 10, 'EXTRA'), option('xl', 'พิเศษ', 15, 'EXTRA')] }),
      item('m-long', LONG_NAME, 1250, { options: [...proteins, option('egg2', 'ไข่ดาวไม่สุกแบบลาวาไหลเยิ้ม', 10, 'EXTRA')] }),
      item('m-omelet', 'ข้าวไข่เจียว', 40),
      item('m-sold', 'ข้าวมันไก่', 50, { isAvailable: false }),
    ],
  },
  {
    id: 'cat-noodle',
    name: 'เมนูเส้น',
    sortOrder: 1,
    menuItems: [item('m-noodle', 'ก๋วยเตี๋ยวต้มยำ', 60), item('m-padthai', 'ผัดไทยกุ้งสด', 80)],
  },
  { id: 'cat-drink', name: 'เครื่องดื่ม', sortOrder: 2, menuItems: [item('m-water', 'น้ำเปล่า', 10), item('m-tea', 'ชาไทยเย็น', 35)] },
  { id: 'cat-special', name: 'เมนูพิเศษประจำสัปดาห์ของทางร้าน', sortOrder: 3, menuItems: [item('m-dessert', 'บัวลอยไข่หวาน', 45)] },
]

const now = Date.now()
const minutesAgo = (m: number) => new Date(now - m * 60_000).toISOString()
const orderItem = (id: string, name: string, quantity: number, unitPrice: number, note: string | null = null, options: { id: string; name: string; price: number }[] = []) => ({
  id,
  quantity,
  unitPrice,
  note,
  name,
  options,
})
const order = (id: string, status: string, createdAt: string, items: ReturnType<typeof orderItem>[]) => ({
  id,
  status,
  createdAt,
  clearedAt: null,
  tableId: 't-12',
  tableSessionId: 's-12',
  items,
  total: items.reduce((sum, i) => sum + (i.unitPrice + i.options.reduce((s, o) => s + o.price, 0)) * i.quantity, 0),
})
const orders = [
  order('aaaaaa01-0000-4000-8000-000000000001', 'PREPARING', minutesAgo(3), [
    orderItem('i1', LONG_NAME, 2, 1250, LONG_NOTE, [{ id: 'shrimp', name: 'กุ้ง', price: 20 }]),
    orderItem('i2', 'ชาไทยเย็น', 3, 35),
  ]),
  order('bbbbbb02-0000-4000-8000-000000000002', 'SERVED', minutesAgo(20), [orderItem('i3', 'ข้าวผัด', 1, 50, null, [{ id: 'pork', name: 'หมู', price: 0 }])]),
  order('cccccc03-0000-4000-8000-000000000003', 'CANCELLED', minutesAgo(25), [orderItem('i4', 'ข้าวมันไก่', 1, 50)]),
]

const session = {
  id: 's-12',
  token: TOKEN,
  status: 'OPEN',
  openedAt: minutesAgo(40),
  closedAt: null,
  expiresAt: null,
  tableId: 't-12',
  table: { id: 't-12', number: 12, status: 'OCCUPIED', seats: 4 },
}

/** ตะกร้าตั้งต้น (zustand persist ใน localStorage) — มีบรรทัดชื่อยาว + โน้ตยาว ไว้ดูการตัดคำ */
const cart = {
  state: {
    token: TOKEN,
    lines: [
      {
        lineId: 'l1',
        menuItemId: 'm-long',
        name: LONG_NAME,
        imageUrl: null,
        basePrice: 1250,
        options: [{ id: 'shrimp', name: 'กุ้ง', price: 20 }, { id: 'egg2', name: 'ไข่ดาวไม่สุกแบบลาวาไหลเยิ้ม', price: 10 }],
        quantity: 12,
        note: LONG_NOTE,
      },
      { lineId: 'l2', menuItemId: 'm-water', name: 'น้ำเปล่า', imageUrl: null, basePrice: 10, options: [], quantity: 3, note: '' },
      { lineId: 'l3', menuItemId: 'm-tea', name: 'ชาไทยเย็น', imageUrl: null, basePrice: 35, options: [], quantity: 1, note: '' },
    ],
  },
  version: 0,
}

const json = (route: Route, body: unknown, status = 200) =>
  route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) })

/** ตอบทุกคำขอไป API ด้วยข้อมูลจำลอง — คำขอที่ไม่รู้จักตอบ 404 (ไม่หลุดไปถึง backend จริงที่อาจเปิดอยู่) */
async function mockApi(page: Page) {
  await page.route(`${API_URL}/**`, (route) => {
    const url = new URL(route.request().url())
    const path = url.pathname
    if (path.startsWith('/socket.io')) return route.abort()
    if (path === '/public/menu') return json(route, menu)
    if (path === `/public/sessions/${TOKEN}`) return json(route, session)
    if (path === `/public/sessions/${TOKEN}/orders`) return json(route, orders)
    if (path === '/public/sessions/closed-token') return json(route, { statusCode: 400, message: 'โต๊ะนี้ปิดบิลแล้ว' }, 400)
    if (path.startsWith('/public/sessions/')) return json(route, { statusCode: 404, message: 'ไม่พบโต๊ะนี้' }, 404)
    return json(route, { statusCode: 404, message: `ไม่ได้จำลอง ${path}` }, 404)
  })
}

interface Report {
  /** ความกว้างทั้งหน้า (scrollWidth) เทียบกับความกว้างจอ */
  pageWidth: number
  viewportWidth: number
  /** element ที่ยื่นออกนอกจอซ้าย/ขวา (ไม่นับที่อยู่ในกล่องเลื่อนแนวนอนตั้งใจ เช่น ชิปหมวดหมู่) */
  offscreen: string[]
  /** ตอนเลื่อนลงสุด เนื้อหาล่างสุดยังโดนแถบติดขอบล่างบังอยู่กี่ px */
  coveredByBottomBar: { px: number; bar: string; lastContent: string } | null
  /** แถบติดล่างที่ลอยอยู่ ไม่ชิดขอบล่างจอและไม่ได้วางบนแถบอื่น (มีช่องว่างโล่งข้างใต้) */
  floatingBars: string[]
  /** กล่องที่ข้อความล้นกรอบโดยไม่ได้ตั้งใจตัด (…) */
  textOverflow: string[]
  /** ปุ่ม/ลิงก์/ช่องกรอกที่เล็กกว่า 24px (ตก) และเล็กกว่า 44px (ข้อสังเกต) */
  tooSmall: string[]
  small: string[]
}

/**
 * วัดหน้าจอในเบราว์เซอร์ — คืนรายการปัญหาที่เจอเป็นข้อความอ่านง่าย
 * screenWidth = ความกว้างจอจริงที่ตั้งไว้ ไม่ใช้ innerWidth เพราะมือถือ (isMobile) จะซูมออกเองเมื่อเนื้อหากว้างเกิน
 * แล้ว innerWidth ขยายตามเนื้อหา ทำให้วัดไม่เจอว่าล้นจอ
 */
async function inspect(page: Page, screenWidth: number): Promise<Report> {
  // ไล่เลื่อนลงสุดก่อน เพื่อวัดตอนที่ลูกค้าเลื่อนดูเนื้อหาล่างสุดแล้ว
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight))
  await page.waitForTimeout(150)

  return page.evaluate((vw) => {
    const vh = window.innerHeight
    const describe = (el: Element) => {
      const tag = el.tagName.toLowerCase()
      const label = (el.getAttribute('aria-label') || (el as HTMLElement).innerText || '').replace(/\s+/g, ' ').trim().slice(0, 40)
      const r = el.getBoundingClientRect()
      return `<${tag}> "${label}" (${Math.round(r.width)}×${Math.round(r.height)} ที่ x=${Math.round(r.left)})`
    }
    const visible = (el: Element) => {
      const r = el.getBoundingClientRect()
      const s = getComputedStyle(el)
      return r.width > 1 && r.height > 1 && s.visibility !== 'hidden' && s.display !== 'none' && Number(s.opacity) > 0
    }
    /** อยู่ในกล่องที่ตัดหรือเลื่อนแนวนอนเอง (overflow-x ไม่ใช่ visible) — ยื่นเกินในกล่องนั้นได้ ไม่ทำให้ทั้งหน้าเลื่อน */
    const clippedByAncestor = (el: Element) => {
      for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
        if (getComputedStyle(p).overflowX !== 'visible') return true
      }
      return false
    }
    /** อยู่ในกล่องที่เลื่อนแนวนอนได้ (เช่น แถบชิปหมวดหมู่) — เนื้อหาที่เกินยังเลื่อนไปดูได้ ไม่นับว่าล้น */
    const inScroller = (el: Element) => {
      for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
        if (['auto', 'scroll'].includes(getComputedStyle(p).overflowX)) return true
      }
      return false
    }
    const isFixed = (el: Element) => {
      for (let p: Element | null = el; p; p = p.parentElement) {
        const pos = getComputedStyle(p).position
        if (pos === 'fixed' || pos === 'sticky') return true
      }
      return false
    }
    const all = [...document.body.querySelectorAll('*')].filter(visible)

    // 1. ยื่นออกนอกจอ — รายงานเฉพาะตัวนอกสุด ไม่ไล่ลูกทุกตัว
    const offEls = all.filter((el) => {
      const r = el.getBoundingClientRect()
      return (r.right > vw + 1 || r.left < -1) && !clippedByAncestor(el)
    })
    const offscreen = offEls.filter((el) => !offEls.some((o) => o !== el && o.contains(el))).map(describe)

    // 2. แถบที่ติดขอบล่างจอ (fixed และอยู่ครึ่งล่างของจอ) — ขอบบนของแถบที่สูงสุด
    const bars = all.filter((el) => getComputedStyle(el).position === 'fixed' && el.getBoundingClientRect().top > vh / 2)
    let coveredByBottomBar: Report['coveredByBottomBar'] = null
    const main = document.querySelector('main')
    if (bars.length && main) {
      const topBar = bars.reduce((a, b) => (a.getBoundingClientRect().top < b.getBoundingClientRect().top ? a : b))
      const barTop = topBar.getBoundingClientRect().top
      const content = [...main.querySelectorAll('*')].filter((el) => visible(el) && !isFixed(el) && el.children.length === 0)
      if (content.length) {
        const last = content.reduce((a, b) => (a.getBoundingClientRect().bottom > b.getBoundingClientRect().bottom ? a : b))
        const px = Math.round(last.getBoundingClientRect().bottom - barTop)
        if (px > 1) coveredByBottomBar = { px, bar: describe(topBar), lastContent: describe(last) }
      }
    }

    // 2.1 แถบติดล่างต้องชิดขอบจอ หรือวางพอดีบนแถบติดล่างอีกอัน — เช่น แถบปุ่มที่ยกขึ้นไว้เหนือเมนูล่าง
    //     แต่จอใหญ่ซ่อนเมนูล่างไปแล้ว แถบจะลอยค้างโดยมีช่องโล่งข้างใต้
    const barTops = bars.map((el) => el.getBoundingClientRect().top)
    //     การ์ดที่ตั้งใจให้ลอย (data-floating เช่น แถบตะกร้าเหนือเมนูล่าง) ไม่นับ
    const floatingBars = bars
      .filter((el) => !el.closest('[data-floating]'))
      .filter((el) => !bars.some((o) => o !== el && o.contains(el)))
      .filter((el) => {
        const bottom = el.getBoundingClientRect().bottom
        return vh - bottom > 2 && !barTops.some((top) => Math.abs(top - bottom) <= 2)
      })
      .map((el) => `${describe(el)} ห่างขอบล่างจอ ${Math.round(vh - el.getBoundingClientRect().bottom)}px`)

    // 3. ข้อความล้นกล่อง: กล่อง block ที่มีข้อความของตัวเองกว้างกว่ากล่อง และไม่ได้ตั้งใจตัด (…) หรือเลื่อน
    //    ข้อความที่ล้นแล้วโดนกล่องแม่ตัดทิ้ง (overflow hidden) ก็นับ เพราะลูกค้าอ่านไม่ครบและไม่มี … บอก
    //    ดูเฉพาะกล่องที่มีข้อความเป็นลูกตรง ๆ — กล่องครอบที่ลูกใช้ margin ติดลบ (เช่น แถบชิปเต็มจอ) ไม่นับ
    const ownText = (el: Element) => [...el.childNodes].some((n) => n.nodeType === Node.TEXT_NODE && n.textContent?.trim())
    const textOverflow = all
      .filter((el) => {
        const s = getComputedStyle(el)
        if (s.display.startsWith('inline') || s.overflowX !== 'visible' || !ownText(el)) return false
        return el.scrollWidth > el.clientWidth + 1 && el.clientWidth > 0 && !inScroller(el)
      })
      .map(describe)

    // 4. ขนาดเป้ากด — radio/checkbox ที่อยู่ใน label กดได้ทั้งแถว จึงวัดที่ label แทนตัวช่องเล็ก ๆ
    const choice = 'input[type=radio], input[type=checkbox], input[type=file]'
    const targets = [
      ...document.querySelectorAll('a[href], button, select, textarea, input:not([type=hidden]), [role=button], label'),
    ].filter((el) => {
      if (!visible(el)) return false
      if (el.tagName === 'LABEL') return Boolean(el.querySelector(choice))
      if (el.matches(choice) && el.closest('label')) return false
      return true
    })
    const sizeOf = (el: Element) => {
      const r = el.getBoundingClientRect()
      return Math.min(r.width, r.height)
    }
    const tooSmall = targets.filter((el) => sizeOf(el) < 24).map(describe)
    const small = targets.filter((el) => sizeOf(el) >= 24 && sizeOf(el) < 44).map(describe)

    return {
      pageWidth: document.documentElement.scrollWidth,
      viewportWidth: vw,
      offscreen,
      coveredByBottomBar,
      floatingBars,
      textOverflow,
      tooSmall,
      small,
    }
  }, screenWidth)
}

// เฉพาะแนวตั้ง — ขนาดจอ/ความละเอียด/user agent ตาม device ของ Playwright
// ตัด defaultBrowserType ออก เพราะ test.use ใน describe เปลี่ยนเบราว์เซอร์ไม่ได้ (ใช้ตาม project)
const device = (name: 'iPhone 13' | 'iPad Pro 11') => {
  const { defaultBrowserType: _browser, ...use } = devices[name]
  return { name, use }
}
const screens = [device('iPhone 13'), device('iPad Pro 11')]

const pages: { name: string; path: string; ready: (page: Page) => Promise<void> }[] = [
  {
    name: 'เมนู',
    path: `/t/${TOKEN}`,
    ready: async (page) => {
      await expect(page.getByText('ข้าวไข่เจียว').first()).toBeVisible()
    },
  },
  {
    name: 'รายละเอียดเมนู (ชื่อยาว)',
    path: `/t/${TOKEN}/menu/m-long`,
    ready: async (page) => {
      await expect(page.getByRole('radio', { name: /หมู/ })).toBeAttached()
    },
  },
  {
    name: 'ตะกร้า',
    path: `/t/${TOKEN}/cart`,
    ready: async (page) => {
      await expect(page.getByText('ยอดรวมรายการอาหาร')).toBeVisible()
    },
  },
  {
    name: 'เช็คบิล',
    path: `/t/${TOKEN}/bill`,
    ready: async (page) => {
      await expect(page.getByText('รวมสุทธิ')).toBeVisible()
    },
  },
  {
    name: 'สถานะออเดอร์',
    path: `/t/${TOKEN}/status`,
    ready: async (page) => {
      await expect(page.getByRole('heading', { name: 'ติดตามสถานะออเดอร์' })).toBeVisible()
      await expect(page.getByText('ข้าวมันไก่').first()).toBeVisible()
    },
  },
  {
    name: 'โต๊ะปิดบิลแล้ว',
    path: '/t/closed-token',
    ready: async (page) => {
      await expect(page.getByRole('heading', { name: 'โต๊ะนี้ปิดบิลแล้ว' })).toBeVisible()
    },
  },
  {
    name: 'QR ผิด',
    path: '/t/no-such-token',
    ready: async (page) => {
      await expect(page.getByRole('heading', { name: 'เปิดโต๊ะนี้ไม่ได้' })).toBeVisible()
    },
  },
]

async function attachFindings(testInfo: TestInfo, report: Report) {
  await testInfo.attach('ผลการวัด.json', { body: JSON.stringify(report, null, 2), contentType: 'application/json' })
  for (const s of report.small) testInfo.annotations.push({ type: 'ปุ่มเล็กกว่า 44px', description: s })
}

for (const screen of screens) {
  test.describe(screen.name, () => {
    test.use(screen.use)

    for (const target of pages) {
      // ทดสอบ: หน้าลูกค้าแสดงผลพอดีจอขนาดนี้ — ไม่เลื่อนซ้ายขวา, เนื้อหาท้ายหน้าไม่ถูกแถบติดขอบล่างบังและแถบไม่ลอยค้าง, ข้อความยาวไม่ล้นกรอบ, และปุ่มไม่เล็กกว่า 24px (เล็กกว่า 44px บันทึกเป็นข้อสังเกต)
      // วิธี: จำลอง API ทั้งหมดด้วยข้อมูลที่มีชื่อเมนูและโน้ตยาว + ใส่ของในตะกร้าไว้ก่อน → เปิดหน้าที่ขนาดจอนี้ รอเนื้อหาขึ้น → เลื่อนลงสุดแล้ววัดตำแหน่ง/ขนาด element ในเบราว์เซอร์ → ถ่ายภาพจอท้ายหน้าและต้นหน้าแนบรายงาน → เช็กผลวัดทีละข้อ
      test(`${target.name}`, async ({ page }, testInfo) => {
        await mockApi(page)
        await page.addInitScript((saved) => localStorage.setItem('restaurant.cart', saved), JSON.stringify(cart))
        await page.goto(target.path)
        await target.ready(page)

        // inspect เลื่อนลงสุดไว้แล้ว — ถ่ายภาพ "ท้ายหน้า" ก่อน แล้วเลื่อนกลับขึ้นถ่าย "ต้นหน้า"
        // ถ่ายแค่ที่เห็นบนจอ ไม่ใช่ fullPage เพราะ fullPage วาดแถบที่ติดจอ (fixed) ไว้กลางภาพ ดูแล้วเข้าใจผิด
        const report = await inspect(page, screen.use.viewport.width)
        const bottom = await page.screenshot({ path: testInfo.outputPath(`${target.name}-ท้ายหน้า.png`) })
        await page.evaluate(() => window.scrollTo(0, 0))
        await page.waitForTimeout(150)
        const top = await page.screenshot({ path: testInfo.outputPath(`${target.name}-ต้นหน้า.png`) })
        await testInfo.attach(`${screen.name} · ${target.name} · ต้นหน้า.png`, { body: top, contentType: 'image/png' })
        await testInfo.attach(`${screen.name} · ${target.name} · ท้ายหน้า.png`, { body: bottom, contentType: 'image/png' })
        await attachFindings(testInfo, report)

        expect(report.pageWidth, 'ทั้งหน้ากว้างเกินจอ ต้องเลื่อนซ้ายขวา').toBeLessThanOrEqual(report.viewportWidth)
        expect(report.offscreen, 'มี element ยื่นออกนอกจอ').toEqual([])
        expect(report.coveredByBottomBar, 'เลื่อนลงสุดแล้วเนื้อหายังโดนแถบด้านล่างบัง').toBeNull()
        expect(report.floatingBars, 'แถบติดล่างลอยอยู่ ไม่ชิดขอบล่างจอ').toEqual([])
        expect(report.textOverflow, 'ข้อความล้นกรอบ').toEqual([])
        expect(report.tooSmall, 'ปุ่ม/ลิงก์เล็กกว่า 24px กดยาก').toEqual([])
      })
    }
  })
}
