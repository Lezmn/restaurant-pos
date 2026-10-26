import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getSales } from '@/features/reports/api'
import type { SalesData } from '@/types/reports'
import { SalesPage } from './SalesPage'

vi.mock('@/features/reports/api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/features/reports/api')>()),
  getSales: vi.fn(),
}))

const hours = Array.from({ length: 24 }, (_, hour) => ({ hour, orderCount: 0, quantity: 0, revenue: 0 }))
hours[12] = { hour: 12, orderCount: 9, quantity: 14, revenue: 980 }
hours[18] = { hour: 18, orderCount: 4, quantity: 6, revenue: 520 }

const data: SalesData = {
  month: '2026-10',
  orderCount: 13,
  totalQuantity: 20,
  totalRevenue: 1500,
  topItems: [
    { menuItemId: 'm1', name: 'ชาเย็น', categoryName: 'เครื่องดื่ม', quantity: 12, revenue: 300 },
    { menuItemId: 'm2', name: 'ต้มยำกุ้ง', categoryName: 'กับข้าว', quantity: 8, revenue: 1200 },
  ],
  unsoldItems: [{ menuItemId: 'm3', name: 'ยำวุ้นเส้น', categoryName: 'กับข้าว' }],
  byHour: hours,
}

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <SalesPage />
    </QueryClientProvider>,
  )
}

beforeEach(() => vi.mocked(getSales).mockReset())

describe('SalesPage (เมนูขายดี)', () => {
  it('เรียงตามจำนวนจานก่อน สลับเป็นยอดเงินแล้วอันดับเปลี่ยน', async () => {
    vi.mocked(getSales).mockResolvedValue(data)
    renderPage()

    const ranking = await screen.findByRole('list', { name: 'อันดับเมนู' })
    expect(within(ranking).getAllByRole('listitem')[0]).toHaveTextContent('ชาเย็น')

    await userEvent.click(screen.getByRole('button', { name: 'ยอดเงิน' }))
    expect(within(ranking).getAllByRole('listitem')[0]).toHaveTextContent('ต้มยำกุ้ง')
  })

  it('บอกช่วงที่ลูกค้าสั่งมากที่สุด และเมนูที่ไม่มีใครสั่ง', async () => {
    vi.mocked(getSales).mockResolvedValue(data)
    renderPage()

    const card = (await screen.findByText('ช่วงที่ลูกค้าสั่งมากที่สุด')).closest('div.rounded-xl')!
    expect(card).toHaveTextContent('12:00–13:00')
    expect(card).toHaveTextContent('9 ออเดอร์ทั้งเดือน')
    expect(screen.getByText(/ยำวุ้นเส้น/)).toBeInTheDocument()
  })

  it('เดือนที่ยังไม่มีบิล → บอกตรง ๆ ไม่โชว์กราฟเปล่า', async () => {
    vi.mocked(getSales).mockResolvedValue({
      ...data,
      orderCount: 0,
      totalQuantity: 0,
      totalRevenue: 0,
      topItems: [],
      byHour: hours.map((h) => ({ ...h, orderCount: 0 })),
    })
    renderPage()

    expect(await screen.findByText(/ยังไม่มีออเดอร์ที่จ่ายแล้วใน/)).toBeInTheDocument()
    expect(screen.queryByText('อันดับเมนู')).not.toBeInTheDocument()
  })
})
