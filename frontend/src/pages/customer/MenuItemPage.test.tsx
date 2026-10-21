import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useCart } from '@/features/public/cart-store'
import { CustomerMenuItemPage } from './MenuItemPage'

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

  it('ต้องเลือกเนื้อสัตว์ก่อน ปุ่มเพิ่มถึงจะกดได้', async () => {
    renderPage()
    const button = await screen.findByRole('button', { name: /กรุณาเลือกเนื้อสัตว์/ })
    expect(button).toBeDisabled()
  })

  it('ราคาบนปุ่ม = (เมนู + เนื้อสัตว์ + ท็อปปิ้ง) × จำนวน และลงตะกร้าตรง', async () => {
    const user = userEvent.setup()
    renderPage()
    await user.click(await screen.findByLabelText(/กุ้ง/))
    await user.click(screen.getByLabelText(/ไข่ดาว/))
    await user.click(screen.getByRole('button', { name: 'เพิ่มจำนวน' }))
    const add = screen.getByRole('button', { name: /เพิ่มรายการ/ })
    expect(add.textContent?.replace(/\s/g, '')).toContain('฿180') // (60+20+10)×2
    await user.type(screen.getByPlaceholderText(/ไม่เผ็ด/), '  ไม่เผ็ด  ')
    await user.click(add)

    expect(await screen.findByText('หน้าตะกร้า')).toBeInTheDocument()
    const [line] = useCart.getState().lines
    expect(line).toMatchObject({ menuItemId: 'm1', quantity: 2, note: 'ไม่เผ็ด', basePrice: 60 })
    expect(line.options.map((o) => o.id).sort()).toEqual(['egg', 'shrimp'])
  })

  it('เปลี่ยนเนื้อสัตว์ = แทนที่ ไม่บวกซ้อน', async () => {
    const user = userEvent.setup()
    renderPage()
    await user.click(await screen.findByLabelText(/กุ้ง/))
    await user.click(screen.getByLabelText(/หมู/))
    expect(
      screen.getByRole('button', { name: /เพิ่มรายการ/ }).textContent?.replace(/\s/g, ''),
    ).toContain('฿60')
  })

  it('เมนูไม่มีแล้ว (ถูกปิด/ลบ) → แสดง "ไม่พบเมนูนี้"', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response(JSON.stringify([]), { status: 200 })),
    )
    renderPage()
    expect(await screen.findByText('ไม่พบเมนูนี้')).toBeInTheDocument()
  })
})
