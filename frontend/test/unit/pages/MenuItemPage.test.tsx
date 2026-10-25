import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useCart } from '@/features/public/cart-store'
import { CustomerMenuItemPage } from '@/pages/customer/MenuItemPage'

const menu = [
  {
    id: 'c1',
    name: 'อาหารจานเดียว',
    menuItems: [
      {
        id: 'm1',
        name: 'กะเพรา',
        price: 60,
        imageUrl: null,
        isAvailable: true,
        options: [
          { id: 'pork', name: 'หมู', price: 0, group: 'PROTEIN', isAvailable: true },
          { id: 'shrimp', name: 'กุ้ง', price: 20, group: 'PROTEIN', isAvailable: true },
          { id: 'egg', name: 'ไข่ดาว', price: 10, group: 'EXTRA', isAvailable: true },
        ],
      },
    ],
  },
]

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={['/t/tok/menu/m1']}>
        <Routes>
          <Route path="/t/:token/menu/:menuItemId" element={<CustomerMenuItemPage />} />
          <Route path="/t/:token/cart" element={<p>หน้าตะกร้า</p>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('CustomerMenuItemPage', () => {
  beforeEach(() => {
    useCart.setState({ token: 'tok', lines: [] })
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(() =>
        Promise.resolve(new Response(JSON.stringify(menu), { status: 200 })),
      ),
    )
  })
  afterEach(() => vi.unstubAllGlobals())

  // ทดสอบ: เมนูที่มีกลุ่มเนื้อสัตว์ ต้องเลือกเนื้อสัตว์ก่อน ปุ่มเพิ่มลงตะกร้าถึงจะกดได้
  // วิธี: mock fetch เมนูกะเพรา → render หน้าเมนู → เช็กว่าปุ่ม "กรุณาเลือกเนื้อสัตว์" กดไม่ได้
  it('ต้องเลือกเนื้อสัตว์ก่อน ปุ่มเพิ่มถึงจะกดได้', async () => {
    renderPage()
    const button = await screen.findByRole('button', { name: /กรุณาเลือกเนื้อสัตว์/ })
    expect(button).toBeDisabled()
  })

  // ทดสอบ: ราคาบนปุ่ม = (เมนู + เนื้อสัตว์ + ท็อปปิ้ง) × จำนวน และสิ่งที่ลงตะกร้าตรงกับที่เลือก (โน้ตตัดช่องว่างหัวท้าย)
  // วิธี: เลือกกุ้ง + ไข่ดาว กดเพิ่มจำนวนเป็น 2 → เช็กราคา ฿180 → พิมพ์โน้ตแล้วกดเพิ่ม → เช็กว่าไปหน้าตะกร้า และบรรทัดในตะกร้ามีจำนวน โน้ต ราคา และตัวเลือกถูก
  it('ราคาบนปุ่ม = (เมนู + เนื้อสัตว์ + ท็อปปิ้ง) × จำนวน และลงตะกร้าตรง', async () => {
    const user = userEvent.setup()
    renderPage()
    await user.click(await screen.findByLabelText(/กุ้ง/))
    await user.click(screen.getByLabelText(/ไข่ดาว/))
    await user.click(screen.getByRole('button', { name: 'เพิ่มจำนวน' }))
    const add = screen.getByRole('button', { name: /เพิ่มรายการ/ })
    expect(add.textContent?.replace(/\s/g, '')).toContain('฿180') // (60+20+10)×2
    // พิมพ์เอง + กดปุ่มลัด รวมกันเป็นโน้ตเดียว
    await user.type(screen.getByLabelText('หมายเหตุเพิ่มเติม'), '  ข้าวน้อย  ')
    await user.click(screen.getByRole('button', { name: 'ไม่เผ็ด' }))
    await user.click(add)

    expect(await screen.findByText('หน้าตะกร้า')).toBeInTheDocument()
    const [line] = useCart.getState().lines
    expect(line).toMatchObject({ menuItemId: 'm1', quantity: 2, note: 'ข้าวน้อย, ไม่เผ็ด', basePrice: 60 })
    expect(line.options.map((o) => o.id).sort()).toEqual(['egg', 'shrimp'])
  })

  // ทดสอบ: เปลี่ยนเนื้อสัตว์ต้องแทนที่ตัวเดิม ไม่บวกราคาซ้อนกัน
  // วิธี: เลือกกุ้ง (+20) แล้วเปลี่ยนเป็นหมู (+0) → เช็กว่าราคาบนปุ่มเป็น ฿60
  it('เปลี่ยนเนื้อสัตว์ = แทนที่ ไม่บวกซ้อน', async () => {
    const user = userEvent.setup()
    renderPage()
    await user.click(await screen.findByLabelText(/กุ้ง/))
    await user.click(screen.getByLabelText(/หมู/))
    expect(
      screen.getByRole('button', { name: /เพิ่มรายการ/ }).textContent?.replace(/\s/g, ''),
    ).toContain('฿60')
  })

  // ทดสอบ: ตัวเลือกที่วัตถุดิบหมดยังโชว์อยู่ แต่มีป้าย "หมด" และเลือกไม่ได้
  // วิธี: mock วัตถุดิบของกุ้งและไข่ดาวเป็นหมด → เช็กป้าย "หมด" 2 อัน, ตัวเลือกที่หมดไม่มีช่องให้เลือก แต่หมูยังเลือกได้
  it('ตัวเลือกที่วัตถุดิบหมด โชว์ป้าย "หมด" และเลือกไม่ได้', async () => {
    const soldOut = structuredClone(menu)
    const opts = soldOut[0].menuItems[0].options as Record<string, unknown>[]
    opts[1].ingredient = { id: 'i-shrimp', name: 'กุ้ง', isAvailable: false }
    opts[2].ingredient = { id: 'i-egg', name: 'ไข่', isAvailable: false }
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response(JSON.stringify(soldOut), { status: 200 })),
    )
    renderPage()
    expect(await screen.findAllByText('หมด')).toHaveLength(2)
    expect(screen.queryByLabelText(/กุ้ง/)).not.toBeInTheDocument()
    expect(screen.queryByLabelText(/ไข่ดาว/)).not.toBeInTheDocument()
    expect(screen.getByLabelText(/หมู/)).toBeInTheDocument()
  })

  // ทดสอบ: เนื้อสัตว์หมดทุกตัวต้องไม่บังคับเลือก ลูกค้ายังสั่งได้
  // วิธี: mock เนื้อสัตว์ทุกตัวเป็นหมด → เช็กว่าปุ่มเพิ่มรายการกดได้
  it('เนื้อสัตว์หมดทุกตัว → ไม่บังคับเลือก สั่งได้', async () => {
    const soldOut = structuredClone(menu)
    const opts = soldOut[0].menuItems[0].options as Record<string, unknown>[]
    for (const o of opts.slice(0, 2)) o.ingredient = { id: 'x', name: 'x', isAvailable: false }
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response(JSON.stringify(soldOut), { status: 200 })),
    )
    renderPage()
    expect(await screen.findByRole('button', { name: /เพิ่มรายการ/ })).toBeEnabled()
  })

  // ทดสอบ: เปิดหน้าเมนูที่ถูกปิดหรือลบไปแล้ว ต้องแสดง "ไม่พบเมนูนี้"
  // วิธี: mock fetch คืนเมนูว่าง → render → เช็กข้อความ
  it('เมนูไม่มีแล้ว (ถูกปิด/ลบ) → แสดง "ไม่พบเมนูนี้"', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response(JSON.stringify([]), { status: 200 })),
    )
    renderPage()
    expect(await screen.findByText('ไม่พบเมนูนี้')).toBeInTheDocument()
  })
})
