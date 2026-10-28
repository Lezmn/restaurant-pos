import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getOrders, updateOrderStatus } from '@/features/orders/api'
import { OrderStatus } from '@/types/enums'

/** ต้องตรงกับ UNDO_MS ใน OrderPage */
const UNDO_MS = 5000
import type { Order } from '@/types/models'
import { OrderPage } from '@/pages/employee/OrderPage'

vi.mock('@/features/orders/api', () => ({
  getOrders: vi.fn(),
  updateOrderStatus: vi.fn(),
  clearOrder: vi.fn(),
  createOrder: vi.fn(),
}))

const order: Order = {
  id: 'o1',
  orderRef: 'abc123',
  tableSessionId: 's1',
  tableName: '4',
  placeLabel: 'โต๊ะ 4',
  isTakeaway: false,
  paid: false,
  status: OrderStatus.PENDING,
  createdAt: new Date().toISOString(),
  clearedAt: null,
  items: [
    {
      id: 'i1',
      menuItemId: 'm1',
      menuItemName: 'กะเพราหมู',
      imageUrl: null,
      quantity: 2,
      unitPrice: 60,
      note: 'ไม่เผ็ด',
      optionNames: [],
      optionsTotal: 0,
    },
  ],
}

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <OrderPage />
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  vi.mocked(getOrders).mockReset()
  vi.mocked(updateOrderStatus).mockReset()
})

describe('OrderPage (จอครัว)', () => {
  it('โหลดไม่ได้ → แจ้ง error และไม่ขึ้น "ไม่มีรายการ" ให้ครัวเข้าใจผิดว่าไม่มีออเดอร์', async () => {
    vi.mocked(getOrders).mockRejectedValue(new Error('network down'))
    renderPage()

    expect(await screen.findByRole('alert')).toHaveTextContent('โหลดออเดอร์ไม่ได้')
    expect(screen.getByRole('button', { name: 'ลองใหม่' })).toBeInTheDocument()
    expect(screen.queryByText('ไม่มีรายการ')).not.toBeInTheDocument()
  })

  it('โหลดได้ → แสดงตั๋วในคอลัมน์รอคิว และคอลัมน์ที่ว่างขึ้น "ไม่มีรายการ"', async () => {
    vi.mocked(getOrders).mockResolvedValue([order])
    renderPage()

    expect(await screen.findByText('โต๊ะ 4')).toBeInTheDocument()
    expect(screen.getByText('กะเพราหมู')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'เริ่มปรุง' })).toBeEnabled()
    expect(screen.getAllByText('ไม่มีรายการ')).toHaveLength(2)
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('กดเลื่อนตั๋ว A แล้วกด B → A ยังล็อกอยู่จนคำขอของ A เสร็จ (กันกดซ้ำ)', async () => {
    const a = { ...order, id: 'a', tableName: '1', placeLabel: 'โต๊ะ 1' }
    const b = { ...order, id: 'b', tableName: '2', placeLabel: 'โต๊ะ 2' }
    vi.mocked(getOrders).mockResolvedValue([a, b])
    const pending: Record<string, () => void> = {}
    vi.mocked(updateOrderStatus).mockImplementation(
      (vars) => new Promise((resolve) => (pending[vars.id] = () => resolve(undefined as never))),
    )
    renderPage()

    const startButtons = await screen.findAllByRole('button', { name: 'เริ่มปรุง' })
    await userEvent.click(startButtons[0])
    await userEvent.click(startButtons[1])

    const ticketA = screen.getByText('โต๊ะ 1').closest('article')!
    const ticketB = screen.getByText('โต๊ะ 2').closest('article')!
    expect(within(ticketA).getByRole('button', { name: 'กำลังส่ง...' })).toBeDisabled()
    expect(within(ticketB).getByRole('button', { name: 'กำลังส่ง...' })).toBeDisabled()

    await act(async () => pending.a())
    await waitFor(() =>
      expect(within(ticketA).queryByRole('button', { name: 'กำลังส่ง...' })).not.toBeInTheDocument(),
    )
    expect(within(ticketB).getByRole('button', { name: 'กำลังส่ง...' })).toBeDisabled()
  })

  it('ตั๋วที่เสิร์ฟแล้วไม่มีปุ่มยกเลิก และไม่โชว์เวลารอ', async () => {
    vi.mocked(getOrders).mockResolvedValue([{ ...order, status: OrderStatus.SERVED }])
    renderPage()

    const ticket = (await screen.findByText('โต๊ะ 4')).closest('article')!
    expect(within(ticket).queryByRole('button', { name: 'ยกเลิกออเดอร์' })).not.toBeInTheDocument()
    expect(within(ticket).queryByText(/^รอ \d|เพิ่งสั่ง/)).not.toBeInTheDocument()
    expect(within(ticket).getByRole('button', { name: 'เสิร์ฟแล้ว · เอาออก' })).toBeEnabled()
  })

  describe('กด "ทำเสร็จแล้ว" → หน่วงไว้ให้เลิกทำได้ก่อนส่งจริง', () => {
    const cooking = { ...order, status: OrderStatus.PREPARING }

    beforeEach(() => {
      vi.useFakeTimers({ shouldAdvanceTime: true })
      vi.mocked(getOrders).mockResolvedValue([cooking])
      vi.mocked(updateOrderStatus).mockResolvedValue(undefined as never)
    })
    afterEach(() => vi.useRealTimers())

    const pressDone = async () => {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
      renderPage()
      await user.click(await screen.findByRole('button', { name: 'ทำเสร็จแล้ว' }))
    }

    it('ตั๋วย้ายไปเสร็จแล้วทันที แต่ยังไม่ส่ง และส่งเมื่อครบเวลา', async () => {
      await pressDone()

      const done = screen.getByRole('region', { name: 'เสร็จแล้ว' })
      expect(within(done).getByText('โต๊ะ 4')).toBeInTheDocument()
      expect(within(done).getByRole('button', { name: 'ยกเลิก' })).toBeEnabled()
      expect(within(done).queryByRole('button', { name: 'เสิร์ฟแล้ว · เอาออก' })).not.toBeInTheDocument()
      expect(updateOrderStatus).not.toHaveBeenCalled()

      await act(async () => vi.advanceTimersByTime(UNDO_MS))
      await waitFor(() => expect(updateOrderStatus).toHaveBeenCalledTimes(1))
      expect(vi.mocked(updateOrderStatus).mock.calls[0][0]).toEqual({ id: 'o1', status: OrderStatus.SERVED })
    })

    it('กดยกเลิก → ตั๋วกลับคอลัมน์กำลังปรุง และไม่ส่งเลย', async () => {
      await pressDone()

      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
      await user.click(screen.getByRole('button', { name: 'ยกเลิก' }))

      const cookingColumn = screen.getByRole('region', { name: 'กำลังปรุง' })
      expect(within(cookingColumn).getByText('โต๊ะ 4')).toBeInTheDocument()
      await act(async () => vi.advanceTimersByTime(UNDO_MS * 2))
      expect(updateOrderStatus).not.toHaveBeenCalled()
    })

    it('ออกจากหน้าระหว่างรอ → ส่งที่ค้างไว้ทันที', async () => {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
      const { unmount } = renderPage()
      await user.click(await screen.findByRole('button', { name: 'ทำเสร็จแล้ว' }))
      unmount()
      await waitFor(() => expect(updateOrderStatus).toHaveBeenCalledTimes(1))
      expect(vi.mocked(updateOrderStatus).mock.calls[0][0]).toEqual({ id: 'o1', status: OrderStatus.SERVED })
    })
  })

  it('ออเดอร์เข้ามา 40 วินาที ยังติดป้าย "ใหม่" (เดิมปัดเศษ หายตั้งแต่ 30 วิ)', async () => {
    const recent = new Date(Date.now() - 40_000).toISOString()
    vi.mocked(getOrders).mockResolvedValue([{ ...order, createdAt: recent }])
    renderPage()

    expect(await screen.findByText('ใหม่')).toBeInTheDocument()
    // นาทีแรกไม่ขึ้น "รอ 0 นาที" ที่อ่านแล้วแปลก
    expect(screen.getByText('เพิ่งสั่ง')).toBeInTheDocument()
  })

  it('รอเกิน 1 นาที → "รอ X นาที"', async () => {
    const earlier = new Date(Date.now() - 7 * 60_000 - 5_000).toISOString()
    vi.mocked(getOrders).mockResolvedValue([{ ...order, createdAt: earlier }])
    renderPage()

    expect(await screen.findByText('รอ 7 นาที')).toBeInTheDocument()
  })

  it('รอเกินชั่วโมง → บอกเป็นชั่วโมง ไม่ใช่นาทียาวจนล้นตั๋ว', async () => {
    const stale = new Date(Date.now() - 55 * 60 * 60_000).toISOString()
    vi.mocked(getOrders).mockResolvedValue([{ ...order, createdAt: stale }])
    renderPage()

    expect(await screen.findByText('รอ 55 ชม.')).toBeInTheDocument()
  })

  it('รอเกิน 15 นาที → screen reader ได้ยิน "เกินเวลา" ไม่ใช่แค่เห็นสีเปลี่ยน', async () => {
    const old = new Date(Date.now() - 20 * 60_000).toISOString()
    vi.mocked(getOrders).mockResolvedValue([{ ...order, createdAt: old }])
    renderPage()

    expect(await screen.findByText(/เกินเวลา 15 นาที/)).toBeInTheDocument()
  })

  it('เกิน 30 นาที → ขั้นที่สอง แดงทึบ และ screen reader ได้ยิน "เกินเวลา 30 นาที"', async () => {
    const minutesAgo = (m: number) => new Date(Date.now() - m * 60_000).toISOString()
    vi.mocked(getOrders).mockResolvedValue([
      { ...order, id: 'late', orderRef: 'late20', createdAt: minutesAgo(20) },
      { ...order, id: 'veryLate', orderRef: 'late40', createdAt: minutesAgo(40) },
    ])
    renderPage()

    const badge = (ref: string) =>
      within(screen.getByText(`#${ref}`).closest('article')!).getByText(/^รอ \d+ นาที/).closest('p')!
    await screen.findByText('#late40')
    expect(badge('late20')).toHaveClass('border-danger')
    expect(badge('late20')).not.toHaveClass('bg-danger-ink')
    expect(badge('late40')).toHaveClass('bg-danger-ink')
    expect(within(badge('late40')).getByText(/เกินเวลา 30 นาที/)).toBeInTheDocument()
  })

  it('เรียงตั๋วที่รอนานสุดขึ้นก่อน', async () => {
    const minutesAgo = (m: number) => new Date(Date.now() - m * 60_000).toISOString()
    vi.mocked(getOrders).mockResolvedValue([
      { ...order, id: 'new', orderRef: 'newest', createdAt: minutesAgo(2) },
      { ...order, id: 'old', orderRef: 'oldest', createdAt: minutesAgo(9) },
    ])
    renderPage()

    const queue = await screen.findByRole('group', { name: 'ตั๋วรอคิว' })
    await within(queue).findByText('#newest')
    const text = queue.textContent ?? ''
    expect(text.indexOf('#oldest')).toBeLessThan(text.indexOf('#newest'))
  })

  describe('iPad แนวตั้ง', () => {
    beforeEach(() => {
      vi.stubGlobal('matchMedia', (query: string) => ({
        matches: query.includes('orientation: portrait'),
        media: query,
        addEventListener: () => {},
        removeEventListener: () => {},
      }))
    })
    afterEach(() => vi.unstubAllGlobals())

    it('เหลือ 2 คอลัมน์ และเสร็จแล้วย่อเป็นแถบการ์ดที่ยังกดเอาออกได้', async () => {
      vi.mocked(getOrders).mockResolvedValue([
        order,
        { ...order, id: 'o2', orderRef: 'srv1', placeLabel: 'โต๊ะ 7', status: OrderStatus.SERVED },
      ])
      renderPage()

      const strip = await screen.findByRole('region', { name: 'เสร็จแล้ว' })
      expect(within(strip).getByText('โต๊ะ 7')).toBeInTheDocument()
      expect(within(strip).getByRole('button', { name: 'เสิร์ฟแล้ว · เอาออก' })).toBeEnabled()
      expect(screen.getByRole('group', { name: 'ตั๋วรอคิว' })).toBeInTheDocument()
      expect(screen.queryByRole('group', { name: 'ตั๋วเสร็จแล้ว' })).not.toBeInTheDocument()
    })
  })
})
