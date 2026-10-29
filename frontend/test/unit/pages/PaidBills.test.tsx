import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { useAuth } from '@/features/auth/use-auth'
import { useCashClosePreview } from '@/features/cash-closes/hooks'
import { usePayment, useTodayPayments, useVoidPayment } from '@/features/payments/hooks'
import { PaymentMethod, PaymentStatus, Role, SlipStatus } from '@/types/enums'
import type { Payment } from '@/types/models'
import { PaidBills } from '@/pages/employee/PaidBills'

vi.mock('@/features/payments/hooks', () => ({
  useTodayPayments: vi.fn(),
  usePayment: vi.fn(),
  useVoidPayment: vi.fn(),
}))
// ปิดยอดวันนี้แล้วหรือยัง — ถ้าปิดแล้วยกเลิกบิลไม่ได้
vi.mock('@/features/cash-closes/hooks', () => ({ useCashClosePreview: vi.fn() }))
// ใบเสร็จมีเทสของตัวเอง (ReceiptDialog.test.tsx) — ที่นี่เช็คแค่ว่าเปิดถูกใบ
vi.mock('@/pages/employee/ReceiptDialog', () => ({
  ReceiptDialog: ({ payment }: { payment: Payment }) => <p>ใบเสร็จของ {payment.id}</p>,
}))

beforeAll(() => {
  HTMLDialogElement.prototype.showModal ??= function (this: HTMLDialogElement) {
    this.open = true
  }
  HTMLDialogElement.prototype.close ??= function (this: HTMLDialogElement) {
    this.open = false
  }
})

// ตรึงนาฬิกาไว้เที่ยงวัน — บิล "30/61 นาทีก่อน" ต้องเป็นของวันนี้เสมอ
// เดิมรันช่วง 00:00–01:01 แล้วบิลกลายเป็นของเมื่อวาน หน้า "บิลวันนี้" กรองทิ้ง เทสต์พังทุกคืน
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  const noon = new Date()
  noon.setHours(12, 0, 0, 0)
  vi.setSystemTime(noon)
})
afterEach(() => {
  vi.useRealTimers()
})

const minutesAgo = (m: number) => new Date(Date.now() - m * 60_000).toISOString()

const bill = (id: string, overrides: Partial<Payment> = {}): Payment => ({
  id,
  tableSessionId: `s-${id}`,
  tableName: id.replace(/\D/g, ''),
  placeLabel: `โต๊ะ ${id.replace(/\D/g, '')}`,
  isTakeaway: false,
  method: PaymentMethod.CASH,
  status: PaymentStatus.COMPLETED,
  amount: 100,
  paidAt: minutesAgo(1),
  voidedAt: null,
  voidReason: null,
  note: null,
  receipt: { number: `RCPT-${id}` } as Payment['receipt'],
  slip: null,
  ...overrides,
})

let voidPayment: { mutate: ReturnType<typeof vi.fn>; reset: ReturnType<typeof vi.fn>; isPending: boolean; error: unknown }
let refetch: ReturnType<typeof vi.fn>

function setup(
  payments: Payment[] | undefined,
  extra: Record<string, unknown> = {},
  voidError: unknown = null,
  { role = Role.STAFF, dayClosed = false }: { role?: Role; dayClosed?: boolean } = {},
) {
  refetch = vi.fn()
  useAuth.setState({ user: { id: 'u1', email: 'e', name: 'พนักงาน', role } })
  vi.mocked(useCashClosePreview).mockReturnValue({ data: { alreadyClosed: dayClosed } } as never)
  vi.mocked(useTodayPayments).mockReturnValue({
    data: payments,
    isPending: payments === undefined && !extra.isError,
    isError: false,
    error: null,
    refetch,
    ...extra,
  } as never)
  // ใบเสร็จต้องดึงทีละใบ — คืนใบที่ขอมา
  vi.mocked(usePayment).mockImplementation(((id?: string) => ({ data: payments?.find((p) => p.id === id) })) as never)
  voidPayment = { mutate: vi.fn(), reset: vi.fn(), isPending: false, error: voidError }
  vi.mocked(useVoidPayment).mockReturnValue(voidPayment as never)
  return render(<PaidBills />)
}

const row = (receiptNo: string) => screen.getByText(receiptNo).closest('tr') as HTMLElement

describe('PaidBills — บิลที่เก็บแล้ววันนี้', () => {
  beforeEach(() => vi.clearAllMocks())

  // ทดสอบ: ตารางบิลวันนี้: แต่ละแถวมีโต๊ะ เลขใบเสร็จ หมายเหตุ วิธีจ่าย + ผลตรวจสลิป ยอด และปุ่มจัดการ และหัวตารางบอกจำนวนบิล
  // วิธี: mock บิลเงินสดที่มีส่วนลด และบิล PromptPay สลิปรอตรวจ → เช็กหัวตาราง "2 บิล" ข้อความในแถว ปุ่มใบเสร็จ/ยกเลิกบิล และป้าย "รอตรวจสลิป"
  it('แต่ละแถวมีโต๊ะ เลขใบเสร็จ หมายเหตุ วิธีจ่าย + ผลตรวจสลิป และยอด · หัวตารางบอกจำนวนบิล', () => {
    setup([
      bill('p1', { note: 'ส่วนลด ฿20: ลูกค้าประจำ', amount: 180.5 }),
      bill('p2', {
        method: PaymentMethod.PROMPTPAY,
        slip: { status: SlipStatus.PENDING, transRef: null, message: 'ธนาคารขัดข้อง', attempts: 1, overrideReason: null, overrideByName: null },
      }),
    ])
    expect(screen.getByRole('heading', { name: /บิลที่เก็บแล้ววันนี้/ })).toHaveTextContent('2 บิล')

    const cash = row('RCPT-p1')
    expect(cash).toHaveTextContent('1')
    expect(cash).toHaveTextContent('ส่วนลด ฿20: ลูกค้าประจำ')
    expect(cash).toHaveTextContent('เงินสด')
    expect(cash).toHaveTextContent('฿180.5')
    expect(within(cash).getByRole('button', { name: 'ใบเสร็จ' })).toBeInTheDocument()
    expect(within(cash).getByRole('button', { name: 'ยกเลิกบิล' })).toBeInTheDocument()

    expect(row('RCPT-p2')).toHaveTextContent('PromptPayรอตรวจสลิป')
  })

  // ทดสอบ: บิลที่ยกเลิกแล้ว: ขีดฆ่ายอด บอกเหตุผล ไม่มีปุ่มจัดการ และไม่แสดงป้ายสลิป
  // วิธี: mock บิล PromptPay ที่ VOIDED → เช็กข้อความ "ยกเลิกแล้ว" เหตุผล คลาส line-through ไม่มีปุ่ม และไม่มี "ตรวจสลิปแล้ว"
  it('บิลที่ยกเลิก: ขีดฆ่ายอด บอกเหตุผล ไม่มีปุ่มจัดการ และไม่โชว์ป้ายสลิป', () => {
    setup([
      bill('p3', {
        status: PaymentStatus.VOIDED,
        voidReason: 'กดผิดโต๊ะ',
        method: PaymentMethod.PROMPTPAY,
        slip: { status: SlipStatus.VERIFIED, transRef: 'x', message: null, attempts: 1, overrideReason: null, overrideByName: null },
      }),
    ])
    const voided = row('RCPT-p3')
    expect(voided).toHaveTextContent('ยกเลิกแล้ว')
    expect(voided).toHaveTextContent('กดผิดโต๊ะ')
    expect(within(voided).getByText('฿100')).toHaveClass('line-through')
    expect(within(voided).queryByRole('button')).not.toBeInTheDocument()
    expect(voided).not.toHaveTextContent('ตรวจสลิปแล้ว')
  })

  // ทดสอบ: เปิดจอค้างข้ามเที่ยงคืน บิลของเมื่อวานต้องไม่โผล่ในตารางวันนี้
  // วิธี: mock บิลของวันนี้กับบิลเมื่อ 26 ชั่วโมงก่อน → เช็กว่าเห็นแค่บิลวันนี้
  it('เปิดจอค้างข้ามเที่ยงคืน → บิลของเมื่อวานไม่โผล่', () => {
    setup([bill('p4'), bill('p5', { paidAt: new Date(Date.now() - 26 * 3_600_000).toISOString() })])
    expect(screen.getByText('RCPT-p4')).toBeInTheDocument()
    expect(screen.queryByText('RCPT-p5')).not.toBeInTheDocument()
  })

  // ทดสอบ: ตารางบิลแสดงข้อความถูกทั้งตอนยังไม่มีบิล กำลังโหลด และโหลดไม่ได้ (ต้องมีปุ่มลองใหม่ และไม่บอกว่ายังไม่มีบิล)
  // วิธี: render สามรอบด้วยรายการว่าง / ยังโหลด / error → เช็กข้อความแต่ละแบบ → กดลองใหม่ เช็ก refetch
  it('ยังไม่มีบิล / กำลังโหลด / โหลดไม่ได้ (พร้อมปุ่มลองใหม่)', async () => {
    const user = userEvent.setup()
    const { unmount } = setup([])
    expect(screen.getByText('ยังไม่มีบิลวันนี้')).toBeInTheDocument()
    unmount()

    const loading = setup(undefined)
    expect(screen.getByText('กำลังโหลด...')).toBeInTheDocument()
    loading.unmount()

    setup(undefined, { isError: true, error: new Error('down') })
    const alert = screen.getByRole('alert')
    expect(alert).toHaveTextContent('โหลดบิลวันนี้ไม่ได้')
    expect(screen.queryByText('ยังไม่มีบิลวันนี้')).not.toBeInTheDocument()
    await user.click(within(alert).getByRole('button', { name: 'ลองใหม่' }))
    expect(refetch).toHaveBeenCalled()
  })

  // ทดสอบ: กดปุ่มใบเสร็จในแถวไหน ต้องเปิดใบเสร็จของบิลนั้น
  // วิธี: mock 2 บิล → กดใบเสร็จของ p7 → เช็กว่าเปิด "ใบเสร็จของ p7" (ReceiptDialog ถูก mock ไว้)
  it('กด "ใบเสร็จ" → เปิดใบเสร็จของบิลนั้น', async () => {
    const user = userEvent.setup()
    setup([bill('p6'), bill('p7')])
    await user.click(within(row('RCPT-p7')).getByRole('button', { name: 'ใบเสร็จ' }))
    expect(screen.getByText('ใบเสร็จของ p7')).toBeInTheDocument()
  })

  // ทดสอบ: ยกเลิกบิลต้องใส่เหตุผล (ช่องว่างล้วนไม่นับ) และส่งเหตุผลที่ตัดช่องว่างแล้ว พอสำเร็จกล่องต้องปิด
  // วิธี: กดยกเลิกบิล → เช็กรายละเอียดบิลในกล่อง และปุ่มยืนยันกดไม่ได้ → พิมพ์ช่องว่างล้วน ยังกดไม่ได้ → พิมพ์เหตุผลแล้วกด → เช็ก payload → เรียก onSuccess → เช็กว่ากล่องปิด
  it('ยกเลิกบิล: ต้องมีเหตุผล (ช่องว่างล้วนไม่นับ) และส่งเหตุผลที่ตัดช่องว่างแล้ว', async () => {
    const user = userEvent.setup()
    setup([bill('p8', { amount: 250 })])
    await user.click(within(row('RCPT-p8')).getByRole('button', { name: 'ยกเลิกบิล' }))

    const dialog = screen.getByRole('dialog', { name: 'ยกเลิกบิล' })
    expect(dialog).toHaveTextContent('โต๊ะ 8 · RCPT-p8 · เงินสด')
    expect(dialog).toHaveTextContent('฿250')
    const confirm = within(dialog).getByRole('button', { name: 'ยืนยันยกเลิกบิล' })
    expect(confirm).toBeDisabled()

    const reason = within(dialog).getByLabelText(/เหตุผล/)
    await user.type(reason, '   ')
    expect(confirm).toBeDisabled()
    await user.type(reason, 'ลูกค้าเปลี่ยนวิธีจ่าย ')
    await user.click(confirm)
    expect(voidPayment.mutate).toHaveBeenCalledWith({ id: 'p8', reason: 'ลูกค้าเปลี่ยนวิธีจ่าย' }, expect.anything())

    // สำเร็จแล้วปิดกล่อง
    voidPayment.mutate.mock.calls[0][1].onSuccess()
    expect(await screen.findByRole('heading', { name: /บิลที่เก็บแล้ววันนี้/ })).toBeInTheDocument()
    expect(screen.queryByRole('dialog', { name: 'ยกเลิกบิล' })).not.toBeInTheDocument()
  })

  // ทดสอบ: ปุ่มลัดเหตุผลยกเลิกบิล — แตะแล้วส่งได้ทันที กดซ้ำเอาออกจนปุ่มยืนยันกดไม่ได้อีก
  it('ยกเลิกบิล: แตะเหตุผลสำเร็จรูปได้ กดซ้ำเอาออก', async () => {
    const user = userEvent.setup()
    setup([bill('p9', { amount: 120 })])
    await user.click(within(row('RCPT-p9')).getByRole('button', { name: 'ยกเลิกบิล' }))

    const dialog = screen.getByRole('dialog', { name: 'ยกเลิกบิล' })
    const confirm = within(dialog).getByRole('button', { name: 'ยืนยันยกเลิกบิล' })
    const chip = within(dialog).getByRole('button', { name: 'กดจ่ายผิดโต๊ะ' })
    await user.click(chip)
    expect(within(dialog).getByLabelText(/เหตุผล/)).toHaveValue('กดจ่ายผิดโต๊ะ')
    await user.click(chip)
    expect(confirm).toBeDisabled()

    await user.click(chip)
    await user.click(confirm)
    expect(voidPayment.mutate).toHaveBeenCalledWith({ id: 'p9', reason: 'กดจ่ายผิดโต๊ะ' }, expect.anything())
  })

  // ทดสอบ: ในกล่องยกเลิกบิล กด "กลับ" ต้องปิดโดยไม่ยกเลิก และ error จาก backend ต้องเห็นในกล่อง
  // วิธี: mock useVoidPayment ให้มี error → เปิดกล่อง เช็กข้อความ alert → กดกลับ → เช็กว่า reset ถูกเรียก, mutate ไม่ถูกเรียก และกล่องปิด
  it('ยกเลิกบิล: กด "กลับ" ปิดกล่องโดยไม่ยกเลิก และ error จาก backend เห็นในกล่อง', async () => {
    const user = userEvent.setup()
    setup([bill('p9')], {}, new Error('ปิดยอดวันนี้ไปแล้ว ยกเลิกบิลไม่ได้'))
    await user.click(within(row('RCPT-p9')).getByRole('button', { name: 'ยกเลิกบิล' }))
    const dialog = screen.getByRole('dialog', { name: 'ยกเลิกบิล' })
    expect(within(dialog).getByRole('alert')).toHaveTextContent('ปิดยอดวันนี้ไปแล้ว ยกเลิกบิลไม่ได้')

    await user.click(within(dialog).getByRole('button', { name: 'กลับ' }))
    expect(voidPayment.reset).toHaveBeenCalled()
    expect(voidPayment.mutate).not.toHaveBeenCalled()
    expect(screen.queryByRole('dialog', { name: 'ยกเลิกบิล' })).not.toBeInTheDocument()
  })

  // ทดสอบ: บิลเกิน 10 ใบต้องแบ่งหน้าละ 10
  // วิธี: mock 12 บิล → เช็กข้อความ "1–10 จาก 12 บิล" → กดหน้า 2 → เช็กว่าเห็นบิลที่ 11 และไม่เห็นบิลแรก
  it('บิลเกิน 10 ใบ → แบ่งหน้า', async () => {
    const user = userEvent.setup()
    setup(Array.from({ length: 12 }, (_, i) => bill(`p${100 + i}`)))
    expect(screen.getByText('1–10 จาก 12 บิล')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '2' }))
    expect(screen.getByText('RCPT-p110')).toBeInTheDocument()
    expect(screen.queryByText('RCPT-p100')).not.toBeInTheDocument()
  })

  // ทดสอบ: พนักงาน (STAFF) ยกเลิกบิลได้แค่ภายใน 1 ชม. หลังรับเงิน เกินแล้วต้องให้เจ้าของร้านยกเลิก
  // วิธี: mock บิลเมื่อ 30 นาทีก่อน กับ 61 นาทีก่อน → บิลแรกกดยกเลิกได้ บิลหลังปุ่มกดไม่ได้และบอกเหตุผล
  it('STAFF: บิลเกิน 1 ชม. → ปุ่มยกเลิกบิลกดไม่ได้ และบอกให้เจ้าของร้านยกเลิก', () => {
    setup([bill('p20', { paidAt: minutesAgo(30) }), bill('p21', { paidAt: minutesAgo(61) })])
    expect(within(row('RCPT-p20')).getByRole('button', { name: 'ยกเลิกบิล' })).toBeEnabled()
    const late = row('RCPT-p21')
    const button = within(late).getByRole('button', { name: 'ยกเลิกบิล' })
    expect(button).toBeDisabled()
    expect(button).toHaveAccessibleDescription('เกิน 1 ชม. ให้เจ้าของร้านยกเลิก')
  })

  // ทดสอบ: ADMIN ยกเลิกบิลที่เกิน 1 ชม. ได้ (ไม่มีจำกัดเวลา)
  // วิธี: login เป็น ADMIN → mock บิลเมื่อ 3 ชม. ก่อน → เช็กว่าปุ่มยกเลิกบิลกดได้
  it('ADMIN: บิลเกิน 1 ชม. ก็ยังยกเลิกได้', () => {
    setup([bill('p22', { paidAt: minutesAgo(180) })], {}, null, { role: Role.ADMIN })
    expect(within(row('RCPT-p22')).getByRole('button', { name: 'ยกเลิกบิล' })).toBeEnabled()
  })

  // ทดสอบ: ปิดยอดวันนี้แล้ว ยกเลิกบิลไม่ได้ทุก role (ยอดลิ้นชักที่นับไว้จะเพี้ยน) และข้อความบอกต่างกันตาม role
  // วิธี: mock alreadyClosed = true → STAFF เห็น "ปิดยอดแล้ว ให้เจ้าของร้านยกเลิก" → ADMIN เห็น "ปิดยอดวันนี้แล้ว ลบการปิดยอดก่อน"
  it('ปิดยอดวันนี้แล้ว → ยกเลิกบิลไม่ได้ทั้ง STAFF และ ADMIN พร้อมบอกเหตุผลตาม role', () => {
    const { unmount } = setup([bill('p23')], {}, null, { dayClosed: true })
    let button = within(row('RCPT-p23')).getByRole('button', { name: 'ยกเลิกบิล' })
    expect(button).toBeDisabled()
    expect(button).toHaveAccessibleDescription('ปิดยอดแล้ว ให้เจ้าของร้านยกเลิก')
    unmount()

    setup([bill('p23')], {}, null, { role: Role.ADMIN, dayClosed: true })
    button = within(row('RCPT-p23')).getByRole('button', { name: 'ยกเลิกบิล' })
    expect(button).toBeDisabled()
    expect(button).toHaveAccessibleDescription('ปิดยอดวันนี้แล้ว ลบการปิดยอดก่อน')
  })

})
