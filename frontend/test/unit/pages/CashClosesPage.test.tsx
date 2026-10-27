import { fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  useCashClosePreview,
  useCashCloses,
  useCreateCashClose,
  useDeleteCashClose,
} from '@/features/cash-closes/hooks'
import type { ApiCashClose, ApiCashClosePreview } from '@/types/api'
import { CashClosesPage } from '@/pages/owner/CashClosesPage'

// ข้อมูลมาจาก hook ทั้งหมด — mock ที่ hook ตรง ๆ คุมได้ทั้งรายการ สถานะโหลด และผลของการลบ
vi.mock('@/features/cash-closes/hooks', () => ({
  useCashCloses: vi.fn(),
  useDeleteCashClose: vi.fn(),
  useCashClosePreview: vi.fn(),
  useCreateCashClose: vi.fn(),
}))

// jsdom ยังไม่มี showModal ของ <dialog>
beforeAll(() => {
  HTMLDialogElement.prototype.showModal ??= function (this: HTMLDialogElement) {
    this.open = true
  }
  HTMLDialogElement.prototype.close ??= function (this: HTMLDialogElement) {
    this.open = false
  }
})

const close = (id: string, date: string, difference: number, overrides: Partial<ApiCashClose> = {}): ApiCashClose => ({
  id,
  date,
  openingFloat: 1000,
  cashSales: 2500,
  drawerExpenses: 120.5,
  expectedCash: 3379.5,
  countedCash: 3379.5 + difference,
  difference,
  promptpaySales: 1800,
  note: null,
  closedAt: '2026-10-21T14:30:00.000Z',
  closedById: 'u1',
  closedByName: 'แคชเชียร์',
  ...overrides,
})

const month = [
  close('c1', '2026-10-21', 0),
  close('c2', '2026-10-22', -40, { note: 'แบงก์ร้อยหาย' }),
  close('c3', '2026-10-23', 25.5, { drawerExpenses: 0 }),
]

/** ยอดวันนี้ที่ยังไม่ปิด — ปุ่ม "ปิดยอดวันนี้" ใช้ค่านี้ */
const todayPreview = (overrides: Partial<ApiCashClosePreview> = {}): ApiCashClosePreview => ({
  date: '2026-10-24',
  cashSales: 1250.5,
  promptpaySales: 830,
  drawerExpenses: 85.25,
  paymentCount: 9,
  drawerExpenseItems: [],
  unpaidTableCount: 0,
  suggestedOpeningFloat: 1000,
  alreadyClosed: null,
  ...overrides,
})

type Mutation = { mutate: ReturnType<typeof vi.fn>; reset: ReturnType<typeof vi.fn>; isPending: boolean; error: unknown }
let deleteCashClose: Mutation
let createCashClose: Mutation
let refetchPreview: ReturnType<typeof vi.fn>

function setup(
  /** null = ยังโหลดไม่เสร็จ */
  data: ApiCashClose[] | null = month,
  {
    query = {},
    deleteError = null,
    preview = todayPreview(),
  }: { query?: Record<string, unknown>; deleteError?: unknown; preview?: ApiCashClosePreview | null } = {},
) {
  refetchPreview = vi.fn()
  vi.mocked(useCashClosePreview).mockReturnValue({ data: preview ?? undefined, refetch: refetchPreview } as never)
  createCashClose = { mutate: vi.fn(), reset: vi.fn(), isPending: false, error: null }
  vi.mocked(useCreateCashClose).mockReturnValue(createCashClose as never)
  vi.mocked(useCashCloses).mockReturnValue({
    data: data ?? undefined,
    isPending: data === null && !query.isError,
    isError: false,
    error: null,
    ...query,
  } as never)
  deleteCashClose = { mutate: vi.fn(), reset: vi.fn(), isPending: false, error: deleteError }
  vi.mocked(useDeleteCashClose).mockReturnValue(deleteCashClose as never)
  return render(<CashClosesPage />)
}

const statCard = (label: string) => screen.getByText(label, { selector: 'p' }).closest('div.rounded-xl') as HTMLElement

/** แถวของวันนั้น หาจากชื่อผู้ปิด/หมายเหตุไม่ได้เพราะซ้ำกัน — ใช้ลำดับแถวในตาราง */
const bodyRows = () => screen.getAllByRole('row').slice(1)

describe('CashClosesPage — ประวัติปิดยอดเงินสด', () => {
  beforeEach(() => vi.clearAllMocks())

  // ทดสอบ: การ์ดสรุปเดือนนับจำนวนวันที่ปิดยอด วันที่เงินขาด และผลต่างรวมทั้งเดือนถูก (ขาด 40 + เกิน 25.5 = ขาด 14.5) และขาดรวมต้องเป็นสีแดง
  // วิธี: mock 3 วัน (ตรง, ขาด 40, เกิน 25.5) → เช็กตัวเลขในการ์ดทั้งสามใบ และสีของการ์ดวันที่เงินขาด/ผลต่างรวม
  it('การ์ดสรุป: จำนวนวัน, วันที่เงินขาด และผลต่างรวมทั้งเดือน', () => {
    setup()
    expect(statCard('วันที่ปิดยอด')).toHaveTextContent('3 วัน')
    expect(statCard('วันที่เงินขาด')).toHaveTextContent('1 วัน')
    expect(statCard('วันที่เงินขาด')).toHaveClass('border-danger')
    expect(statCard('ผลต่างรวมทั้งเดือน')).toHaveTextContent('-฿14.5')
    expect(statCard('ผลต่างรวมทั้งเดือน')).toHaveClass('border-danger')
  })

  // ทดสอบ: เดือนที่ไม่มีวันเงินขาดและผลต่างรวมเป็น 0 ต้องขึ้น "ตรง" และการ์ดเป็นสีเขียว
  // วิธี: mock วันที่ตรงพอดีวันเดียว → เช็กว่าวันที่เงินขาด 0 วัน ผลต่างรวม "ตรง" และการ์ดทั้งสองเป็น border-success
  it('ไม่มีวันเงินขาด → ผลต่างรวม "ตรง" สีเขียว', () => {
    setup([close('c1', '2026-10-21', 0)])
    expect(statCard('วันที่เงินขาด')).toHaveTextContent('0 วัน')
    expect(statCard('วันที่เงินขาด')).toHaveClass('border-success')
    expect(statCard('ผลต่างรวมทั้งเดือน')).toHaveTextContent('ตรง')
    expect(statCard('ผลต่างรวมทั้งเดือน')).toHaveClass('border-success')
  })

  // ทดสอบ: ผลต่างที่หักลบกันพอดี (0.1 + 0.2 − 0.3) ต้องขึ้น "ตรง" ไม่ใช่ "+฿0" จากเศษทศนิยมของการบวกเลข
  // วิธี: mock 3 วันที่ผลต่าง 0.1, 0.2 และ -0.3 → เช็กว่าผลต่างรวมเป็น "ตรง" และการ์ดเป็นสีเขียว
  it('ผลต่างรวมปัดเศษก่อนแสดง: หักลบกันพอดีต้องขึ้น "ตรง"', () => {
    setup([close('c1', '2026-10-21', 0.1), close('c2', '2026-10-22', 0.2), close('c3', '2026-10-23', -0.3)])
    expect(statCard('ผลต่างรวมทั้งเดือน')).toHaveTextContent('ตรง')
    expect(statCard('ผลต่างรวมทั้งเดือน')).not.toHaveTextContent('฿')
  })

  // ทดสอบ: แต่ละแถวแสดงเงินทอน รับเงินสด หยิบออก (ติดลบ หรือ "-" ถ้าไม่ได้หยิบ) ควรมี นับได้ ผลต่าง PromptPay ผู้ปิด และหมายเหตุ ครบและถูกสี
  // วิธี: mock 3 วัน → เช็กข้อความในแต่ละแถว และคลาสสีของช่องผลต่าง (ตรง = เขียว, ขาด = แดง, เกิน = ส้ม)
  it('ตารางรายวัน: ตัวเลขครบ ผลต่างมีเครื่องหมายและสีถูก', () => {
    setup()
    const [even, short, over] = bodyRows()
    expect(even).toHaveTextContent('฿1,000')
    expect(even).toHaveTextContent('฿2,500')
    expect(even).toHaveTextContent('-฿120.5')
    expect(even).toHaveTextContent('฿3,379.5')
    expect(even).toHaveTextContent('฿1,800')
    expect(even).toHaveTextContent('แคชเชียร์')
    expect(within(even).getByText('ตรง')).toHaveClass('text-success')

    expect(within(short).getByText('-฿40')).toHaveClass('text-danger')
    expect(short).toHaveTextContent('฿3,339.5')
    expect(short).toHaveTextContent('แบงก์ร้อยหาย')

    expect(within(over).getByText('+฿25.5')).toHaveClass('text-brand-400')
    expect(over.querySelectorAll('td')[3]).toHaveTextContent(/^-$/)
  })

  // ทดสอบ: ระหว่างโหลดขึ้น "กำลังโหลด...", เดือนที่ยังไม่มีการปิดยอดบอกว่าไม่มี และโหลดไม่ได้ต้องเห็นข้อความ error
  // วิธี: render สามรอบด้วย query ที่ยังโหลด / รายการว่าง / error → เช็กข้อความแต่ละแบบ
  it('กำลังโหลด / ยังไม่มีการปิดยอด / โหลดไม่ได้', () => {
    const loading = setup(null)
    expect(screen.getByText('กำลังโหลด...')).toBeInTheDocument()
    expect(screen.queryByText('ยังไม่มีการปิดยอดในเดือนนี้')).not.toBeInTheDocument()
    loading.unmount()

    const empty = setup([])
    expect(screen.getByText('ยังไม่มีการปิดยอดในเดือนนี้')).toBeInTheDocument()
    expect(statCard('วันที่ปิดยอด')).toHaveTextContent('0 วัน')
    empty.unmount()

    setup([], { query: { isError: true, error: new Error('เซิร์ฟเวอร์ไม่ตอบ') } })
    expect(screen.getByText('เซิร์ฟเวอร์ไม่ตอบ')).toBeInTheDocument()
  })

  // ทดสอบ: เปลี่ยนเดือนแล้วต้องดึงประวัติปิดยอดของเดือนใหม่
  // วิธี: เปลี่ยนค่าช่องเดือนเป็น 2026-09 → เช็กว่า useCashCloses ถูกเรียกครั้งล่าสุดด้วย '2026-09'
  it('เปลี่ยนเดือน → โหลดข้อมูลเดือนนั้น', () => {
    setup()
    fireEvent.change(screen.getByLabelText('เดือน'), { target: { value: '2026-09' } })
    expect(vi.mocked(useCashCloses)).toHaveBeenLastCalledWith('2026-09')
  })

  // ทดสอบ: ลบการปิดยอดต้องยืนยันก่อน กล่องบอกวัน ยอดที่นับ ผลต่าง และคนปิด, กดย้อนกลับต้องปิดกล่องและล้าง error เดิมโดยไม่ลบ
  // วิธี: กดลบแถววันที่เงินขาด → เช็กข้อความในกล่อง "ลบการปิดยอด" → กดย้อนกลับ → เช็กว่า reset ถูกเรียก, mutate ไม่ถูกเรียก และกล่องปิด
  it('ลบการปิดยอด: กล่องยืนยันบอกรายละเอียด และย้อนกลับได้โดยไม่ลบ', async () => {
    const user = userEvent.setup()
    setup()
    await user.click(within(bodyRows()[1]).getByRole('button', { name: 'ลบ' }))
    const dialog = screen.getByRole('dialog', { name: 'ลบการปิดยอด' })
    expect(dialog).toHaveTextContent('ปิดยอดวันที่')
    expect(dialog).toHaveTextContent('นับได้ ฿3,339.5 · -฿40 · โดย แคชเชียร์')
    expect(dialog).toHaveTextContent('แคชเชียร์จะกดปิดยอดวันนี้ใหม่ได้')

    await user.click(within(dialog).getByRole('button', { name: 'ย้อนกลับ' }))
    expect(deleteCashClose.reset).toHaveBeenCalled()
    expect(deleteCashClose.mutate).not.toHaveBeenCalled()
    expect(screen.queryByRole('dialog', { name: 'ลบการปิดยอด' })).not.toBeInTheDocument()
  })

  // ทดสอบ: กดยืนยันลบแล้วต้องส่ง id ของวันนั้น และพอสำเร็จกล่องปิด
  // วิธี: กดลบแถวแรก → กดปุ่ม "ลบ" ในกล่อง → เช็กว่า mutate ได้ 'c1' → เรียก onSuccess → เช็กว่ากล่องปิด
  it('ลบการปิดยอด: ยืนยันแล้วส่ง id และปิดกล่องเมื่อสำเร็จ', async () => {
    const user = userEvent.setup()
    setup()
    await user.click(within(bodyRows()[0]).getByRole('button', { name: 'ลบ' }))
    const dialog = screen.getByRole('dialog', { name: 'ลบการปิดยอด' })
    await user.click(within(dialog).getByRole('button', { name: 'ลบ' }))
    expect(deleteCashClose.mutate).toHaveBeenCalledWith('c1', expect.anything())
    deleteCashClose.mutate.mock.calls[0][1].onSuccess()
    expect(await screen.findByRole('heading', { name: 'ปิดยอดเงินสด' })).toBeInTheDocument()
    expect(screen.queryByRole('dialog', { name: 'ลบการปิดยอด' })).not.toBeInTheDocument()
  })

  // ทดสอบ: ลบไม่สำเร็จ ต้องเห็นข้อความ error จาก backend ในกล่องยืนยัน (กล่องบังทุกอย่างข้างหลัง)
  // วิธี: mock useDeleteCashClose ให้มี error → เปิดกล่องลบ → เช็กว่า alert ในกล่องมีข้อความนั้น
  it('ลบไม่สำเร็จ → error แสดงในกล่องยืนยัน', async () => {
    const user = userEvent.setup()
    setup(month, { deleteError: new Error('ลบได้เฉพาะ ADMIN') })
    await user.click(within(bodyRows()[0]).getByRole('button', { name: 'ลบ' }))
    const dialog = screen.getByRole('dialog', { name: 'ลบการปิดยอด' })
    expect(within(dialog).getByRole('alert')).toHaveTextContent('ลบได้เฉพาะ ADMIN')
  })
})

describe('CashClosesPage — ปิดยอดวันนี้', () => {
  beforeEach(() => vi.clearAllMocks())

  // ทดสอบ: ยังไม่ปิดยอดวันนี้ ต้องมีปุ่ม "ปิดยอดวันนี้" กดแล้วดึงยอดล่าสุดก่อน และเปิดกล่องปิดยอด
  // วิธี: mock ยอดวันนี้ที่ยังไม่ปิด → กดปุ่ม → เช็กว่า refetch ถูกเรียก และเห็นกล่อง "ปิดยอดวันนี้"
  it('ยังไม่ปิดยอด → กด "ปิดยอดวันนี้" ดึงยอดล่าสุดแล้วเปิดกล่องปิดยอด', async () => {
    const user = userEvent.setup()
    setup()
    await user.click(screen.getByRole('button', { name: 'ปิดยอดวันนี้' }))
    expect(refetchPreview).toHaveBeenCalled()
    expect(screen.getByRole('dialog', { name: 'ปิดยอดวันนี้' })).toBeInTheDocument()
  })

  // ทดสอบ: ยอดวันนี้ยังโหลดไม่เสร็จ ปุ่มปิดยอดต้องกดไม่ได้ (ยังไม่รู้ยอดที่ควรมี)
  // วิธี: mock preview เป็น undefined → เช็กว่าปุ่มปิดยอดวันนี้ disabled
  it('ยอดวันนี้ยังโหลดไม่เสร็จ → ปุ่มปิดยอดกดไม่ได้', () => {
    setup(month, { preview: null })
    expect(screen.getByRole('button', { name: 'ปิดยอดวันนี้' })).toBeDisabled()
  })

  // ทดสอบ: ปิดยอดวันนี้ไปแล้ว ต้องไม่มีปุ่มปิดซ้ำ และบอกว่าปิดแล้ว
  // วิธี: mock alreadyClosed → เช็กข้อความ "ปิดยอดวันนี้แล้ว" และไม่มีปุ่ม
  it('ปิดยอดวันนี้แล้ว → บอกว่าปิดแล้ว ไม่มีปุ่มปิดซ้ำ', () => {
    setup(month, { preview: todayPreview({ alreadyClosed: close('c9', '2026-10-24', 0) }) })
    expect(screen.getByText(/ปิดยอดวันนี้แล้ว/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'ปิดยอดวันนี้' })).not.toBeInTheDocument()
  })

  // ทดสอบ: กล่องปิดยอดคิด "ควรมีในลิ้นชัก" = เงินทอนตั้งต้น + รับเงินสด − หยิบออก, บอกเงินขาด/เกิน และส่งค่าที่กรอก
  // วิธี: เปิดกล่อง (เงินทอนเติมให้ 1000) → เช็กยอดควรมี ฿2,165.25 → กรอกนับได้ 2125.25 → เช็ก "เงินขาด ฿40" → กรอกหมายเหตุ → ยืนยัน → เช็ก payload → เรียก onSuccess แล้วกล่องปิด
  it('กล่องปิดยอด: คิดยอดควรมี บอกเงินขาด และส่งเงินทอน ยอดที่นับ และหมายเหตุ', async () => {
    const user = userEvent.setup()
    setup()
    await user.click(screen.getByRole('button', { name: 'ปิดยอดวันนี้' }))
    const dialog = screen.getByRole('dialog', { name: 'ปิดยอดวันนี้' })

    expect(within(dialog).getByLabelText(/เงินทอนตั้งต้น/)).toHaveValue(1000)
    expect(within(dialog).getByText('ควรมีในลิ้นชัก').nextElementSibling).toHaveTextContent('฿2,165.25')

    const confirm = within(dialog).getByRole('button', { name: 'ยืนยันปิดยอด' })
    expect(confirm).toBeDisabled()
    await user.type(within(dialog).getByLabelText(/เงินที่นับได้จริง/), '2125.25')
    expect(dialog).toHaveTextContent('เงินขาด ฿40')
    await user.type(within(dialog).getByLabelText(/หมายเหตุ/), 'แบงก์ร้อยหาย')
    await user.click(confirm)

    expect(createCashClose.mutate).toHaveBeenCalledWith(
      { openingFloat: 1000, countedCash: 2125.25, note: 'แบงก์ร้อยหาย' },
      expect.anything(),
    )
    createCashClose.mutate.mock.calls[0][1].onSuccess()
    expect(await screen.findByRole('heading', { name: 'ปิดยอดเงินสด' })).toBeInTheDocument()
    expect(screen.queryByRole('dialog', { name: 'ปิดยอดวันนี้' })).not.toBeInTheDocument()
  })

  // ทดสอบ: ยังมีโต๊ะค้างจ่าย ต้องเตือนในกล่องปิดยอดว่าเงินที่เก็บทีหลังจะไม่อยู่ในยอดวันนี้
  // วิธี: mock unpaidTableCount 2 → เปิดกล่อง → เช็กข้อความเตือน "2 โต๊ะ"
  it('ยังมีโต๊ะค้างจ่าย → กล่องปิดยอดเตือนจำนวนโต๊ะ', async () => {
    const user = userEvent.setup()
    setup(month, { preview: todayPreview({ unpaidTableCount: 2 }) })
    await user.click(screen.getByRole('button', { name: 'ปิดยอดวันนี้' }))
    expect(screen.getByRole('dialog', { name: 'ปิดยอดวันนี้' })).toHaveTextContent('ยังมี 2 โต๊ะ ที่ยังไม่จ่าย')
  })

  // ทดสอบ: ไม่มีเงินทอนครั้งก่อนให้เติม ต้องกรอกเงินทอนก่อนถึงยืนยันได้ และยอดควรมีขึ้น "-"
  // วิธี: mock suggestedOpeningFloat null → เปิดกล่อง กรอกแค่ยอดนับ → ปุ่มยืนยันยังกดไม่ได้ และยอดควรมีเป็น "-" → กรอกเงินทอน → กดได้
  it('ไม่มีเงินทอนตั้งต้นให้เติม → ต้องกรอกก่อน ยืนยันถึงจะกดได้', async () => {
    const user = userEvent.setup()
    setup(month, { preview: todayPreview({ suggestedOpeningFloat: null }) })
    await user.click(screen.getByRole('button', { name: 'ปิดยอดวันนี้' }))
    const dialog = screen.getByRole('dialog', { name: 'ปิดยอดวันนี้' })
    expect(within(dialog).getByText('ควรมีในลิ้นชัก').nextElementSibling).toHaveTextContent('-')
    await user.type(within(dialog).getByLabelText(/เงินที่นับได้จริง/), '500')
    expect(within(dialog).getByRole('button', { name: 'ยืนยันปิดยอด' })).toBeDisabled()
    await user.type(within(dialog).getByLabelText(/เงินทอนตั้งต้น/), '500')
    expect(within(dialog).getByRole('button', { name: 'ยืนยันปิดยอด' })).toBeEnabled()
  })
})
