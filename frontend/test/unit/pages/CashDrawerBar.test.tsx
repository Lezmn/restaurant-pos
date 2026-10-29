import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { useCashClosePreview, useCreateCashClose } from '@/features/cash-closes/hooks'
import { useAddDrawerExpense } from '@/features/expenses/hooks'
import type { ApiCashClose, ApiCashClosePreview } from '@/types/api'
import { CashDrawerBar } from '@/pages/employee/CashDrawerBar'

// กล่องหยิบเงินออก เทสบนหน้าเว็บจริงแล้ว (test/e2e/cashier/discount-drawer-dashboard.spec.ts)
// กล่องปิดยอดย้ายไปหน้าเจ้าของร้านแล้ว — เทสที่ CashClosesPage.test.tsx
// ที่นี่เทสตัวเลขบนแถบลิ้นชัก สถานะปิดยอดแล้ว และ error
vi.mock('@/features/cash-closes/hooks', () => ({ useCashClosePreview: vi.fn(), useCreateCashClose: vi.fn() }))
vi.mock('@/features/expenses/hooks', () => ({ useAddDrawerExpense: vi.fn() }))

beforeAll(() => {
  HTMLDialogElement.prototype.showModal ??= function (this: HTMLDialogElement) {
    this.open = true
  }
  HTMLDialogElement.prototype.close ??= function (this: HTMLDialogElement) {
    this.open = false
  }
})

const preview = (overrides: Partial<ApiCashClosePreview> = {}): ApiCashClosePreview => ({
  date: '2026-10-24',
  cashSales: 1250.5,
  promptpaySales: 830,
  drawerExpenses: 85.25,
  paymentCount: 9,
  drawerExpenseItems: [
    { id: 'e1', title: 'น้ำแข็ง', amount: 35.25, spentAt: '2026-10-24T03:15:00.000Z', createdByName: 'แคชเชียร์' },
    { id: 'e2', title: 'ผักชี', amount: 50, spentAt: '2026-10-24T05:00:00.000Z', createdByName: null },
  ] as ApiCashClosePreview['drawerExpenseItems'],
  unpaidTableCount: 0,
  suggestedOpeningFloat: 1000,
  alreadyClosed: null,
  ...overrides,
})

const closed = (difference: number): ApiCashClose => ({
  id: 'c1',
  date: '2026-10-24',
  openingFloat: 1000,
  cashSales: 1250.5,
  drawerExpenses: 85.25,
  expectedCash: 2165.25,
  countedCash: 2165.25 + difference,
  difference,
  promptpaySales: 830,
  note: null,
  closedAt: '2026-10-24T14:30:00.000Z',
  closedById: 'u',
  closedByName: 'เจ้าของร้าน',
})

let refetch: ReturnType<typeof vi.fn>

function setup(data: ApiCashClosePreview | undefined, extra: Record<string, unknown> = {}) {
  refetch = vi.fn()
  vi.mocked(useCashClosePreview).mockReturnValue({
    data,
    isPending: data === undefined && !extra.isError,
    isError: false,
    error: null,
    refetch,
    ...extra,
  } as never)
  vi.mocked(useCreateCashClose).mockReturnValue({ mutate: vi.fn(), isPending: false, error: null } as never)
  vi.mocked(useAddDrawerExpense).mockReturnValue({ mutate: vi.fn(), isPending: false, error: null } as never)
  return render(<CashDrawerBar />)
}

/** ค่าในแถวของสมุดลิ้นชัก (dt → dd) */
const ledger = (label: string) => {
  const section = screen.getByRole('region', { name: 'ลิ้นชักวันนี้' })
  const dt = within(section).getAllByText(label).map((el) => el.closest('dt')).find((el) => el?.nextElementSibling?.tagName === 'DD')
  return dt?.nextElementSibling?.textContent
}

describe('CashDrawerBar — ลิ้นชักวันนี้', () => {
  beforeEach(() => vi.clearAllMocks())

  // ทดสอบ: แถบลิ้นชักวันนี้แสดงตัวเลขถูก: รับเงินสด, หยิบออก (ติดลบ), เงินสดสุทธิ = รับ − หยิบ และ PromptPay แยกต่างหาก
  // วิธี: mock ยอดลิ้นชัก (เงินสด 1,250.5, หยิบออก 85.25, PromptPay 830, 9 บิล) → เช็กวันที่/จำนวนบิล และค่าแต่ละแถว
  it('ตัวเลขบนแถบ: รับเงินสด, หยิบออก (ติดลบ), เงินสดสุทธิ = รับ − หยิบ, PromptPay แยกต่างหาก', () => {
    setup(preview())
    const section = screen.getByRole('region', { name: 'ลิ้นชักวันนี้' })
    expect(section).toHaveTextContent('24 ต.ค. · 9 บิล')
    expect(ledger('รับเงินสด')).toBe('฿1,250.5')
    expect(ledger('หยิบออก')).toBe('−฿85.25')
    expect(ledger('เงินสดสุทธิ')).toBe('฿1,165.25')
    expect(within(section).getByText('PromptPay เข้าบัญชีร้าน').nextElementSibling).toHaveTextContent('฿830')
  })

  // ทดสอบ: ยังไม่หยิบเงินออก ต้องแสดง ฿0 (ไม่ใช่ −฿0) และไม่มีรายการหยิบออก
  // วิธี: mock หยิบออก 0 และไม่มีรายการ → เช็กแถวหยิบออก ฿0, เงินสดสุทธิเท่ายอดรับ และไม่มีส่วน "รายการหยิบออก"
  it('ยังไม่หยิบเงินออก → หยิบออกเป็น ฿0 (ไม่ใช่ −฿0) และไม่มีรายการหยิบออก', () => {
    setup(preview({ drawerExpenses: 0, drawerExpenseItems: [] }))
    expect(ledger('หยิบออก')).toBe('฿0')
    expect(ledger('เงินสดสุทธิ')).toBe('฿1,250.5')
    expect(screen.queryByText(/รายการหยิบออก/)).not.toBeInTheDocument()
  })

  // ทดสอบ: รายการหยิบเงินออกบอกจำนวนรายการ ชื่อ ยอดติดลบ และคนที่หยิบ
  // วิธี: mock 2 รายการ (น้ำแข็ง, ผักชี) → เปิดส่วนรายการหยิบออก (2) → เช็กข้อความแต่ละรายการ
  it('รายการหยิบออก: จำนวน รายการ ยอดติดลบ และคนที่หยิบ', () => {
    setup(preview())
    const list = screen.getByText(/รายการหยิบออก \(2\)/).closest('details') as HTMLElement
    const items = within(list).getAllByRole('listitem')
    expect(items[0]).toHaveTextContent('น้ำแข็ง')
    expect(items[0]).toHaveTextContent('−฿35.25')
    expect(items[0]).toHaveTextContent('แคชเชียร์')
    expect(items[1]).toHaveTextContent('ผักชี')
    expect(items[1]).toHaveTextContent('−฿50')
  })

  // ทดสอบ: ยังไม่ปิดยอด แถบลิ้นชักมีปุ่มหยิบเงินออก แต่ไม่มีปุ่มปิดยอดวันนี้แล้ว (ย้ายไปหน้า "ปิดยอดเงินสด" ของเจ้าของร้าน)
  // วิธี: mock ยอดที่ยังไม่ปิด → เช็กว่ามีปุ่มหยิบเงินออก และไม่มีปุ่มปิดยอดวันนี้
  it('ยังไม่ปิดยอด → มีปุ่มหยิบเงินออก แต่ไม่มีปุ่มปิดยอดวันนี้ (ย้ายไปหน้าเจ้าของร้าน)', () => {
    setup(preview())
    expect(screen.getByRole('button', { name: 'หยิบเงินออก' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'ปิดยอดวันนี้' })).not.toBeInTheDocument()
  })

  // ทดสอบ: ปิดยอดแล้ว ต้องสรุปว่าใครปิด และผลต่างเป็น ตรงพอดี / เงินขาด / เงินเกิน ถูก โดยไม่มีปุ่มปิดยอดซ้ำ แต่ยังหยิบเงินออกได้
  // วิธี: วน 3 กรณีผลต่าง (0, -40, 25.5) → mock ว่าวันนี้ปิดยอดแล้ว → เช็กข้อความในแถบ ไม่มีปุ่มปิดยอดวันนี้ และยังมีปุ่มหยิบเงินออก
  it.each([
    [0, 'ตรงพอดี'],
    [-40, 'เงินขาด ฿40'],
    [25.5, 'เงินเกิน ฿25.5'],
  ])('ปิดยอดแล้ว (ผลต่าง %s) → สรุปคนปิด ยอดที่นับ และ "%s" และไม่มีปุ่มปิดยอดซ้ำ', (difference, text) => {
    setup(preview({ alreadyClosed: closed(difference) }))
    const section = screen.getByRole('region', { name: 'ลิ้นชักวันนี้' })
    expect(section).toHaveTextContent('ปิดยอดแล้ว')
    expect(section).toHaveTextContent('โดย เจ้าของร้าน')
    expect(section).toHaveTextContent(text)
    expect(screen.queryByRole('button', { name: 'ปิดยอดวันนี้' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'หยิบเงินออก' })).toBeInTheDocument()
  })

  // ทดสอบ: โหลดยอดลิ้นชักครั้งแรกไม่ได้ ต้องขึ้นแถบ error พร้อมปุ่มลองใหม่ และไม่แสดงตัวเลข
  // วิธี: mock query เป็น error ไม่มีข้อมูล → เช็กข้อความ alert และไม่มีแถวรับเงินสด → กดลองใหม่ → เช็ก refetch
  it('โหลดครั้งแรกไม่ได้ → แถบ error พร้อมลองใหม่ ไม่โชว์ตัวเลข', async () => {
    const user = userEvent.setup()
    setup(undefined, { isError: true, error: new Error('down') })
    const alert = screen.getByRole('alert')
    expect(alert).toHaveTextContent('โหลดยอดลิ้นชักไม่ได้')
    expect(screen.queryByText('รับเงินสด')).not.toBeInTheDocument()
    await user.click(within(alert).getByRole('button', { name: 'ลองใหม่' }))
    expect(refetch).toHaveBeenCalled()
  })

  // ทดสอบ: มีตัวเลขจากรอบก่อนแต่อัปเดตไม่ได้ ยังแสดงตัวเลขเดิม พร้อมเตือนว่าอาจไม่ใช่ยอดล่าสุด
  // วิธี: mock query error แต่มีข้อมูลเดิม → เช็กข้อความเตือน และแถวรับเงินสดยังแสดงค่าเดิม
  it('มีตัวเลขรอบก่อนแต่อัปเดตไม่ได้ → ยังโชว์ตัวเลข พร้อมเตือนว่าอาจไม่ใช่ล่าสุด', () => {
    setup(preview(), { isError: true, error: new Error('down') })
    expect(screen.getByRole('alert')).toHaveTextContent('อัปเดตยอดไม่ได้ ตัวเลขอาจไม่ใช่ล่าสุด')
    expect(ledger('รับเงินสด')).toBe('฿1,250.5')
  })

  // ทดสอบ: กำลังโหลดครั้งแรกโชว์ skeleton / ไม่มีข้อมูลและไม่ error ไม่ต้องโชว์อะไร
  it('กำลังโหลด → skeleton, ไม่มีข้อมูลและไม่ error → ไม่แสดงแถบ', () => {
    const { container, unmount } = setup(undefined)
    expect(container.querySelector('.animate-pulse')).toBeInTheDocument()
    unmount()
    const { container: empty } = setup(undefined, { isPending: false })
    expect(empty).toBeEmptyDOMElement()
  })
})

describe('CashDrawerBar — กล่องหยิบเงินออก', () => {
  beforeEach(() => vi.clearAllMocks())

  const open = async () => {
    const user = userEvent.setup()
    setup(preview())
    await user.click(screen.getByRole('button', { name: 'หยิบเงินออก' }))
    const dialog = screen.getByRole('dialog', { name: 'หยิบเงินออกจากลิ้นชัก' })
    return { user, dialog }
  }

  // ทดสอบ: ยังไม่กรอกยอดหรือรายละเอียด / ยอด 0 ต้องกดบันทึกไม่ได้
  it('ต้องมีทั้งยอด > 0 และรายละเอียด ถึงกดบันทึกได้', async () => {
    const { user, dialog } = await open()
    const save = within(dialog).getByRole('button', { name: 'บันทึก' })
    expect(save).toBeDisabled()
    await user.type(within(dialog).getByPlaceholderText('เช่น น้ำแข็ง 2 ถุง'), 'น้ำแข็ง')
    expect(save).toBeDisabled()
    await user.type(within(dialog).getByRole('spinbutton'), '0')
    expect(save).toBeDisabled()
    await user.clear(within(dialog).getByRole('spinbutton'))
    await user.type(within(dialog).getByRole('spinbutton'), '35.5')
    expect(save).toBeEnabled()
  })

  // ทดสอบ: บันทึกส่งยอด/รายละเอียด/หมวดที่เลือก และปิดกล่องเมื่อสำเร็จ
  it('บันทึก → ส่งยอด รายละเอียด หมวดที่เลือก แล้วปิดกล่องเมื่อสำเร็จ', async () => {
    const { user, dialog } = await open()
    const mutate = vi.mocked(useAddDrawerExpense).mock.results[0].value.mutate as ReturnType<typeof vi.fn>
    expect(within(dialog).getByRole('button', { name: 'วัตถุดิบ' })).toHaveAttribute('aria-pressed', 'true')
    await user.type(within(dialog).getByRole('spinbutton'), '120')
    await user.type(within(dialog).getByPlaceholderText('เช่น น้ำแข็ง 2 ถุง'), 'ถ่านเตา')
    await user.click(within(dialog).getByRole('button', { name: 'อุปกรณ์' }))
    expect(within(dialog).getByRole('button', { name: 'อุปกรณ์' })).toHaveAttribute('aria-pressed', 'true')
    await user.click(within(dialog).getByRole('button', { name: 'บันทึก' }))

    expect(mutate).toHaveBeenCalledWith({ detail: 'ถ่านเตา', amount: 120, category: 'EQUIPMENT' }, expect.anything())
    const { onSuccess } = mutate.mock.calls[0][1] as { onSuccess: () => void }
    act(() => onSuccess())
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  // ทดสอบ: กดย้อนกลับปิดกล่องโดยไม่บันทึก
  it('ย้อนกลับ → ปิดกล่อง ไม่บันทึก', async () => {
    const { user, dialog } = await open()
    await user.click(within(dialog).getByRole('button', { name: 'ย้อนกลับ' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(vi.mocked(useAddDrawerExpense).mock.results[0].value.mutate).not.toHaveBeenCalled()
  })

  // ทดสอบ: กำลังบันทึกปุ่มเปลี่ยนข้อความและกดซ้ำไม่ได้ / บันทึกไม่ผ่านโชว์ error ในกล่อง
  it('กำลังบันทึก → ปุ่ม "กำลังบันทึก..." กดไม่ได้ และ error โชว์ในกล่อง', async () => {
    const user = userEvent.setup()
    setup(preview())
    vi.mocked(useAddDrawerExpense).mockReturnValue({
      mutate: vi.fn(),
      isPending: true,
      error: new Error('บันทึกไม่สำเร็จ'),
    } as never)
    await user.click(screen.getByRole('button', { name: 'หยิบเงินออก' }))
    const dialog = screen.getByRole('dialog')
    expect(within(dialog).getByRole('button', { name: 'กำลังบันทึก...' })).toBeDisabled()
    expect(dialog).toHaveTextContent('บันทึกไม่สำเร็จ')
  })
})
