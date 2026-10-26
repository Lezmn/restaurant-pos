import { fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { useAddExpense, useDeleteExpense, useUpdateExpense } from '@/features/expenses/hooks'
import { useFinance } from '@/features/reports/hooks'
import { ExpenseCategory, PaymentMethod } from '@/types/enums'
import type { FinanceData, Transaction } from '@/types/reports'
import { FinancePage } from '@/pages/owner/FinancePage'

// ข้อมูลมาจาก hook ทั้งหมด — mock ที่ hook ตรง ๆ คุมได้ทั้งข้อมูล สถานะโหลด และผลของการบันทึก
vi.mock('@/features/reports/hooks', () => ({ useFinance: vi.fn() }))
vi.mock('@/features/expenses/hooks', () => ({
  useAddExpense: vi.fn(),
  useUpdateExpense: vi.fn(),
  useDeleteExpense: vi.fn(),
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

const tx = (id: string, overrides: Partial<Transaction> = {}): Transaction => ({
  id,
  type: 'EXPENSE',
  date: '2026-10-20T05:00:00.000Z',
  detail: `รายการ ${id}`,
  category: ExpenseCategory.INGREDIENTS,
  amount: -100,
  paidFromDrawer: false,
  createdByName: null,
  ...overrides,
})

const base: FinanceData = {
  month: '2026-10',
  summary: {
    netProfit: 12500.5,
    expenseTotal: 3400.25,
    revenueTotal: 15900.75,
    cashTotal: 9900.75,
    promptPayTotal: 6000,
    paymentCount: 1234,
  },
  transactions: [
    tx('in1', { type: 'INCOME', detail: 'โต๊ะ 5', category: PaymentMethod.CASH, amount: 250 }),
    tx('ex1', { detail: 'ซื้อหมูจากตลาด', amount: -1200.5 }),
    tx('ex2', { detail: 'น้ำแข็ง', category: ExpenseCategory.OTHER, amount: -35, paidFromDrawer: true, createdByName: 'แคชเชียร์' }),
  ],
}

type Mutation = { mutate: ReturnType<typeof vi.fn>; isPending: boolean; error: unknown }
let addExpense: Mutation
let updateExpense: Mutation
let deleteExpense: Mutation

function setup(
  /** null = ยังโหลดไม่เสร็จ / ไม่มีข้อมูล */
  data: FinanceData | null = base,
  { query = {}, saveError = null, deleteError = null }: { query?: Record<string, unknown>; saveError?: unknown; deleteError?: unknown } = {},
) {
  vi.mocked(useFinance).mockReturnValue({
    data: data ?? undefined,
    isPending: data === null && !query.isError,
    isError: false,
    error: null,
    ...query,
  } as never)
  addExpense = { mutate: vi.fn(), isPending: false, error: saveError }
  updateExpense = { mutate: vi.fn(), isPending: false, error: saveError }
  deleteExpense = { mutate: vi.fn(), isPending: false, error: deleteError }
  vi.mocked(useAddExpense).mockReturnValue(addExpense as never)
  vi.mocked(useUpdateExpense).mockReturnValue(updateExpense as never)
  vi.mocked(useDeleteExpense).mockReturnValue(deleteExpense as never)
  return render(<FinancePage />)
}

/** การ์ดตัวเลข: ป้ายกับค่าอยู่ใน div เดียวกัน (StatCard) */
const statCard = (label: string) => screen.getByText(label, { selector: 'p' }).closest('div.rounded-xl') as HTMLElement

/** แถวในตาราง "รายการล่าสุด" หาจากข้อความรายละเอียด */
const row = (detail: string) => screen.getByText(detail).closest('tr') as HTMLElement

const bodyRows = () => screen.getAllByRole('row').slice(1)

describe('FinancePage — ภาพรวมทางการเงิน', () => {
  beforeEach(() => vi.clearAllMocks())

  // ทดสอบ: ระหว่างโหลด ขึ้นข้อความกำลังโหลด, โหลดไม่ได้ขึ้นข้อความ error จาก API และ error ที่ไม่ใช่ Error object ได้ข้อความสำรอง
  // วิธี: render สามรอบด้วย query ที่ยังโหลด / error พร้อมข้อความ / error เป็นสตริง → เช็กข้อความแต่ละแบบ
  it('กำลังโหลด / โหลดไม่สำเร็จ / error ที่ไม่ใช่ Error object', () => {
    const loading = setup(null)
    expect(screen.getByText('กำลังโหลด...')).toBeInTheDocument()
    loading.unmount()

    const failed = setup(null, { query: { isError: true, error: new Error('เซิร์ฟเวอร์ไม่ตอบ') } })
    expect(screen.getByText('เซิร์ฟเวอร์ไม่ตอบ')).toBeInTheDocument()
    failed.unmount()

    setup(null, { query: { isError: true, error: 'x' } })
    expect(screen.getByText('โหลดข้อมูลไม่สำเร็จ')).toBeInTheDocument()
  })

  // ทดสอบ: การ์ด 6 ใบ (กำไรสุทธิ, รายจ่าย, รายรับรวม, เงินสด, PromptPay, จำนวนบิล) แสดงค่าตรงกับข้อมูลของเดือน
  // วิธี: mock ข้อมูลสรุปตัวอย่าง → หาการ์ดจากป้าย แล้วเช็กตัวเลขในการ์ด
  it('การ์ดสรุปเดือนแสดงตัวเลขตรงกับข้อมูล', () => {
    setup()
    expect(statCard('กำไรสุทธิ')).toHaveTextContent('฿12,500.5')
    expect(statCard('รายจ่าย')).toHaveTextContent('฿3,400.25')
    expect(statCard('รายรับรวม')).toHaveTextContent('฿15,900.75')
    expect(statCard('จ่ายเงินสด')).toHaveTextContent('฿9,900.75')
    expect(statCard('จ่าย PromptPay')).toHaveTextContent('฿6,000')
    expect(statCard('จำนวนบิล')).toHaveTextContent('1,234')
  })

  // ทดสอบ: กำไรเป็นบวกการ์ดกำไรเป็นสีเขียว แต่ถ้าขาดทุนต้องเป็นสีแดง ไม่ใช่เขียวจนอ่านผิด
  // วิธี: render กำไรบวก เช็กคลาส border-success → render ใหม่ด้วยกำไรติดลบ เช็กคลาส border-danger และตัวเลขมีเครื่องหมายลบ
  it('ขาดทุน → การ์ดกำไรสุทธิเป็นสีแดง', () => {
    const { unmount } = setup()
    expect(statCard('กำไรสุทธิ')).toHaveClass('border-success')
    unmount()

    setup({ ...base, summary: { ...base.summary, netProfit: -39760 } })
    expect(statCard('กำไรสุทธิ')).toHaveClass('border-danger')
    expect(statCard('กำไรสุทธิ')).toHaveTextContent('-฿39,760')
  })

  // ทดสอบ: ตารางแสดงรายรับเป็น + สีเขียว รายจ่ายเป็น − สีแดง, รายจ่ายที่หยิบจากลิ้นชักบอกคนที่หยิบ, และรายรับจากบิลแก้หรือลบที่หน้านี้ไม่ได้
  // วิธี: mock รายรับ 1 + รายจ่าย 2 → เช็กยอด สี หมวด ข้อความ "หยิบจากลิ้นชัก · โดย ..." และปุ่มแก้ไข/ลบของแต่ละแถว
  it('ตารางรายการ: เครื่องหมาย สี หมวด หยิบจากลิ้นชัก และรายรับแก้ไม่ได้', () => {
    setup()
    const income = row('โต๊ะ 5')
    expect(income).toHaveTextContent('+฿250')
    expect(income).toHaveTextContent('เงินสด')
    expect(income).toHaveTextContent('รายรับจากบิล')
    expect(within(income).queryByRole('button')).not.toBeInTheDocument()
    expect(within(income).getByText(/฿250/)).toHaveClass('text-success')

    const meat = row('ซื้อหมูจากตลาด')
    expect(meat).toHaveTextContent('-฿1,200.5')
    expect(meat).toHaveTextContent('วัตถุดิบ')
    expect(within(meat).getByText(/฿1,200.5/)).toHaveClass('text-danger')
    expect(within(meat).getByRole('button', { name: 'แก้ไข' })).toBeInTheDocument()
    expect(within(meat).getByRole('button', { name: 'ลบ' })).toBeInTheDocument()

    expect(row('น้ำแข็ง')).toHaveTextContent('หยิบจากลิ้นชัก · โดย แคชเชียร์')
    expect(row('น้ำแข็ง')).toHaveTextContent('อื่น ๆ')
  })

  // ทดสอบ: ตัวกรองหมวดหมู่แสดงเฉพาะรายการของหมวดนั้น, หมวดที่ไม่มีรายการบอกว่าไม่มี และกด "ทั้งหมด" แล้วกลับมาครบ
  // วิธี: กดชิป วัตถุดิบ → เช็กว่าเหลือแถวเดียว → กดชิป ค่าเช่าร้าน → เช็กข้อความ "ไม่มีรายการในหมวดนี้" → กดทั้งหมด → เช็กว่ากลับมา 3 แถว
  it('กรองตามหมวดหมู่', async () => {
    const user = userEvent.setup()
    setup()
    await user.click(screen.getByRole('button', { name: 'วัตถุดิบ' }))
    expect(bodyRows()).toHaveLength(1)
    expect(row('ซื้อหมูจากตลาด')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'ค่าเช่าร้าน' }))
    expect(screen.getByText('ไม่มีรายการในหมวดนี้')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'ทั้งหมด' }))
    expect(bodyRows()).toHaveLength(3)
  })

  // ทดสอบ: เปลี่ยนเดือนแล้วต้องดึงข้อมูลของเดือนใหม่
  // วิธี: เปลี่ยนค่าช่องเดือนเป็น 2026-09 → เช็กว่า useFinance ถูกเรียกครั้งล่าสุดด้วย '2026-09'
  it('เปลี่ยนเดือน → โหลดข้อมูลเดือนนั้น', () => {
    setup()
    fireEvent.change(screen.getByLabelText('เดือน'), { target: { value: '2026-09' } })
    expect(vi.mocked(useFinance)).toHaveBeenLastCalledWith('2026-09')
  })

  // ทดสอบ: รายการเกิน 10 ต้องแบ่งหน้าละ 10 และกดหน้า 2 แล้วเห็นรายการที่เหลือ
  // วิธี: mock รายจ่าย 12 รายการ → เช็กว่ามี 10 แถว และข้อความ "1–10 จาก 12" → กดหน้า 2 → เช็กว่าเหลือ 2 แถว
  it('รายการเกิน 10 → แบ่งหน้า', async () => {
    const user = userEvent.setup()
    setup({ ...base, transactions: Array.from({ length: 12 }, (_, i) => tx(`e${i + 1}`)) })
    expect(bodyRows()).toHaveLength(10)
    expect(screen.getByText(/1–10 จาก 12/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '2' }))
    expect(bodyRows()).toHaveLength(2)
    expect(screen.getByText('รายการ e11')).toBeInTheDocument()
  })
})

describe('FinancePage — เพิ่ม/แก้/ลบรายจ่าย', () => {
  beforeEach(() => vi.clearAllMocks())

  // ทดสอบ: ฟอร์มเพิ่มรายจ่ายเช็กข้อมูลก่อนส่ง (ต้องมีรายละเอียด, ต้องมีจำนวนเงิน, เงินต้องมากกว่า 0) โดยไม่ยิง API
  // วิธี: กด "+ รายจ่าย" → กดบันทึกตอนว่าง → ใส่รายละเอียดแล้วกดอีก → ใส่จำนวน 0 แล้วกดอีก → เช็กข้อความเตือนแต่ละขั้น และ mutate ไม่ถูกเรียกเลย
  it('ฟอร์มเพิ่ม: เตือนเมื่อข้อมูลไม่ครบหรือเงินไม่ถูกต้อง', async () => {
    const user = userEvent.setup()
    setup()
    await user.click(screen.getByRole('button', { name: '+ รายจ่าย' }))
    const save = screen.getByRole('button', { name: 'บันทึกรายจ่าย' })

    await user.click(save)
    expect(screen.getByRole('alert')).toHaveTextContent('กรุณากรอกรายละเอียด')

    await user.type(screen.getByLabelText('รายละเอียด'), '   ')
    await user.click(save)
    expect(screen.getByRole('alert')).toHaveTextContent('กรุณากรอกรายละเอียด')

    await user.type(screen.getByLabelText('รายละเอียด'), 'ค่าแก๊ส')
    await user.click(save)
    expect(screen.getByRole('alert')).toHaveTextContent('กรุณากรอกจำนวนเงิน')

    await user.type(screen.getByLabelText(/จำนวนเงิน/), '0')
    await user.click(save)
    expect(screen.getByRole('alert')).toHaveTextContent('จำนวนเงินต้องมากกว่า 0')
    expect(addExpense.mutate).not.toHaveBeenCalled()
  })

  // ทดสอบ: เพิ่มรายจ่ายที่ข้อมูลครบแล้วส่งรายละเอียดที่ตัดช่องว่าง หมวดที่เลือก และจำนวนเงินเป็นตัวเลข พอสำเร็จฟอร์มต้องปิด
  // วิธี: เปิดฟอร์ม → กรอกรายละเอียดมีช่องว่างหัวท้าย เลือกหมวด ค่าน้ำค่าไฟ กรอก 450.75 → กดบันทึก → เช็ก payload → เรียก onSuccess → เช็กว่าปุ่มกลับเป็น "+ รายจ่าย"
  it('ฟอร์มเพิ่ม: ส่งข้อมูลถูกต้อง และปิดฟอร์มเมื่อสำเร็จ', async () => {
    const user = userEvent.setup()
    setup()
    await user.click(screen.getByRole('button', { name: '+ รายจ่าย' }))
    expect(screen.getByRole('combobox')).toHaveValue(ExpenseCategory.INGREDIENTS)

    await user.type(screen.getByLabelText('รายละเอียด'), '  ค่าไฟเดือนนี้  ')
    await user.selectOptions(screen.getByRole('combobox'), ExpenseCategory.UTILITIES)
    await user.type(screen.getByLabelText(/จำนวนเงิน/), '450.75')
    await user.click(screen.getByRole('button', { name: 'บันทึกรายจ่าย' }))

    expect(addExpense.mutate).toHaveBeenCalledWith(
      { detail: 'ค่าไฟเดือนนี้', category: ExpenseCategory.UTILITIES, amount: 450.75 },
      expect.anything(),
    )
    addExpense.mutate.mock.calls[0][1].onSuccess()
    expect(await screen.findByRole('button', { name: '+ รายจ่าย' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'บันทึกรายจ่าย' })).not.toBeInTheDocument()
  })

  // ทดสอบ: บันทึกไม่สำเร็จ ต้องเห็นข้อความ error จาก backend ในฟอร์ม
  // วิธี: mock useAddExpense ให้มี error → เปิดฟอร์ม → เช็กว่า alert มีข้อความนั้น
  it('ฟอร์มเพิ่ม: error จาก backend แสดงในฟอร์ม', async () => {
    const user = userEvent.setup()
    setup(base, { saveError: new Error('ปิดยอดเดือนนี้ไปแล้ว') })
    await user.click(screen.getByRole('button', { name: '+ รายจ่าย' }))
    expect(screen.getByRole('alert')).toHaveTextContent('ปิดยอดเดือนนี้ไปแล้ว')
  })

  // ทดสอบ: กดแก้ไขรายจ่าย ฟอร์มต้องเติมค่าเดิมไว้ (จำนวนเงินเป็นบวก) และบันทึกแล้วส่ง id กับค่าใหม่ พอสำเร็จกล่องปิด
  // วิธี: กดแก้ไขแถวซื้อหมู → เช็กค่าในกล่อง "แก้ไขรายจ่าย" → เปลี่ยนจำนวนเป็น 1300 → กดบันทึกการแก้ไข → เช็ก payload → เรียก onSuccess → เช็กว่ากล่องปิด
  it('แก้ไขรายจ่าย: เติมค่าเดิม แล้วส่งค่าใหม่พร้อม id', async () => {
    const user = userEvent.setup()
    setup()
    await user.click(within(row('ซื้อหมูจากตลาด')).getByRole('button', { name: 'แก้ไข' }))
    const dialog = screen.getByRole('dialog', { name: 'แก้ไขรายจ่าย' })
    expect(within(dialog).getByLabelText('รายละเอียด')).toHaveValue('ซื้อหมูจากตลาด')
    expect(within(dialog).getByRole('combobox')).toHaveValue(ExpenseCategory.INGREDIENTS)
    const amount = within(dialog).getByLabelText(/จำนวนเงิน/)
    expect(amount).toHaveValue(1200.5)

    await user.clear(amount)
    await user.type(amount, '1300')
    await user.click(within(dialog).getByRole('button', { name: 'บันทึกการแก้ไข' }))
    expect(updateExpense.mutate).toHaveBeenCalledWith(
      { id: 'ex1', input: { detail: 'ซื้อหมูจากตลาด', category: ExpenseCategory.INGREDIENTS, amount: 1300 } },
      expect.anything(),
    )
    updateExpense.mutate.mock.calls[0][1].onSuccess()
    expect(await screen.findByRole('heading', { name: 'ภาพรวมทางการเงิน' })).toBeInTheDocument()
    expect(screen.queryByRole('dialog', { name: 'แก้ไขรายจ่าย' })).not.toBeInTheDocument()
  })

  // ทดสอบ: กดยกเลิกในกล่องแก้ไข ต้องปิดโดยไม่บันทึก
  // วิธี: เปิดกล่องแก้ไข → กดยกเลิก → เช็กว่ากล่องปิด และ updateExpense.mutate ไม่ถูกเรียก
  it('แก้ไขรายจ่าย: ยกเลิกแล้วไม่บันทึก', async () => {
    const user = userEvent.setup()
    setup()
    await user.click(within(row('น้ำแข็ง')).getByRole('button', { name: 'แก้ไข' }))
    const dialog = screen.getByRole('dialog', { name: 'แก้ไขรายจ่าย' })
    await user.click(within(dialog).getByRole('button', { name: 'ยกเลิก' }))
    expect(screen.queryByRole('dialog', { name: 'แก้ไขรายจ่าย' })).not.toBeInTheDocument()
    expect(updateExpense.mutate).not.toHaveBeenCalled()
  })

  // ทดสอบ: ลบรายจ่ายต้องยืนยันก่อน กล่องยืนยันบอกว่ากำลังลบรายการไหนและยอดเท่าไร, กดยกเลิกไม่ลบ, กดลบแล้วส่ง id และพอสำเร็จกล่องปิด
  // วิธี: กดลบแถวซื้อหมู → เช็กรายละเอียดในกล่อง "ลบรายจ่าย" → กดยกเลิก เช็กว่าไม่ลบ → เปิดใหม่แล้วกด "ลบรายการนี้" → เช็กว่า mutate ได้ 'ex1' → เรียก onSuccess → เช็กว่ากล่องปิด
  it('ลบรายจ่าย: ยืนยันก่อน แล้วส่ง id', async () => {
    const user = userEvent.setup()
    setup()
    await user.click(within(row('ซื้อหมูจากตลาด')).getByRole('button', { name: 'ลบ' }))
    let dialog = screen.getByRole('dialog', { name: 'ลบรายจ่าย' })
    expect(dialog).toHaveTextContent('ซื้อหมูจากตลาด')
    expect(dialog).toHaveTextContent('วัตถุดิบ')
    expect(dialog).toHaveTextContent('฿1,200.5')
    await user.click(within(dialog).getByRole('button', { name: 'ยกเลิก' }))
    expect(screen.queryByRole('dialog', { name: 'ลบรายจ่าย' })).not.toBeInTheDocument()
    expect(deleteExpense.mutate).not.toHaveBeenCalled()

    await user.click(within(row('ซื้อหมูจากตลาด')).getByRole('button', { name: 'ลบ' }))
    dialog = screen.getByRole('dialog', { name: 'ลบรายจ่าย' })
    await user.click(within(dialog).getByRole('button', { name: 'ลบรายการนี้' }))
    expect(deleteExpense.mutate).toHaveBeenCalledWith('ex1', expect.anything())
    deleteExpense.mutate.mock.calls[0][1].onSuccess()
    expect(await screen.findByRole('heading', { name: 'ภาพรวมทางการเงิน' })).toBeInTheDocument()
    expect(screen.queryByRole('dialog', { name: 'ลบรายจ่าย' })).not.toBeInTheDocument()
  })

  // ทดสอบ: ลบไม่สำเร็จ ต้องเห็นข้อความ error จาก backend บนหน้า
  // วิธี: mock useDeleteExpense ให้มี error → render → เช็กว่า alert มีข้อความนั้น
  it('ลบไม่สำเร็จ → แสดง error', () => {
    setup(base, { deleteError: new Error('ลบไม่ได้ รายการนี้ถูกปิดยอดแล้ว') })
    expect(screen.getByRole('alert')).toHaveTextContent('ลบไม่ได้ รายการนี้ถูกปิดยอดแล้ว')
  })
})
