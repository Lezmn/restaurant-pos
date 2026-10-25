import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { useAuth } from '@/features/auth/use-auth'
import { useConfirmSlip, useRecheckSlip, useSlipIssuePayments } from '@/features/payments/hooks'
import { PaymentMethod, PaymentStatus, Role, SlipStatus } from '@/types/enums'
import type { Payment } from '@/types/models'
import { SlipIssues } from '@/pages/employee/SlipIssues'

vi.mock('@/features/payments/hooks', () => ({
  useSlipIssuePayments: vi.fn(),
  useRecheckSlip: vi.fn(),
  useConfirmSlip: vi.fn(),
}))

beforeAll(() => {
  HTMLDialogElement.prototype.showModal ??= function (this: HTMLDialogElement) {
    this.open = true
  }
  HTMLDialogElement.prototype.close ??= function (this: HTMLDialogElement) {
    this.open = false
  }
})

const issue = (id: string, status: SlipStatus, message: string): Payment => ({
  id,
  tableSessionId: `s-${id}`,
  tableName: id.replace(/\D/g, ''),
  method: PaymentMethod.PROMPTPAY,
  status: PaymentStatus.COMPLETED,
  amount: 350,
  paidAt: '2026-10-23T12:42:00.000Z',
  voidedAt: null,
  voidReason: null,
  note: null,
  receipt: { number: `RCPT-${id}` } as Payment['receipt'],
  slip: { status, transRef: null, message, attempts: 3, overrideReason: null, overrideByName: null },
})

type Mutation = { mutate: ReturnType<typeof vi.fn>; isPending: boolean; error: unknown; variables?: unknown }
let recheck: Mutation
let confirm: Mutation

function setup(payments: Payment[], role: Role = Role.STAFF, recheckState: Partial<Mutation> = {}) {
  vi.mocked(useSlipIssuePayments).mockReturnValue({ data: payments } as never)
  recheck = { mutate: vi.fn(), isPending: false, error: null, ...recheckState }
  confirm = { mutate: vi.fn(), isPending: false, error: null }
  vi.mocked(useRecheckSlip).mockReturnValue(recheck as never)
  vi.mocked(useConfirmSlip).mockReturnValue(confirm as never)
  useAuth.setState({ user: { id: 'u', email: 'e', name: 'n', role } })
  return render(<SlipIssues />)
}

const item = (table: string) =>
  screen.getByText(new RegExp(`^โต๊ะ ${table} ·`)).closest('li') as HTMLElement

describe('SlipIssues — สลิป PromptPay ที่ต้องตาม', () => {
  beforeEach(() => vi.clearAllMocks())

  // ทดสอบ: ไม่มีสลิปค้าง แผงต้องไม่แสดงอะไรเลย
  // วิธี: mock รายการว่าง → render → เช็กว่า container ว่าง
  it('ไม่มีสลิปค้าง → ไม่แสดงอะไรเลย', () => {
    const { container } = setup([])
    expect(container).toBeEmptyDOMElement()
  })

  // ทดสอบ: แผงสลิปที่ต้องตามแสดงจำนวน และแต่ละบิลบอกโต๊ะ ยอด เลขใบเสร็จ ป้ายผลตรวจ และเหตุผลล่าสุด
  // วิธี: mock บิลรอตรวจ 1 ใบ และไม่ผ่าน 1 ใบ → เช็กหัวข้อ (2) และข้อความในแต่ละรายการ
  it('แสดงจำนวน และแต่ละบิลบอกโต๊ะ ยอด เลขใบเสร็จ ป้ายผลตรวจ และเหตุผลล่าสุด', () => {
    setup([issue('p1', SlipStatus.PENDING, 'ธนาคารขัดข้องชั่วคราว'), issue('p2', SlipStatus.FAILED, 'ยอดไม่ตรง')])
    expect(screen.getByRole('heading', { name: 'สลิป PromptPay ที่ต้องตาม (2)' })).toBeInTheDocument()
    expect(item('1')).toHaveTextContent('โต๊ะ 1 · ฿350')
    expect(item('1')).toHaveTextContent('RCPT-p1')
    expect(item('1')).toHaveTextContent('รอตรวจสลิป')
    expect(item('1')).toHaveTextContent('ธนาคารขัดข้องชั่วคราว')
    expect(item('2')).toHaveTextContent('สลิปไม่ผ่าน')
    expect(item('2')).toHaveTextContent('ยอดไม่ตรง')
  })

  // ทดสอบ: ปุ่มตรวจอีกครั้งมีเฉพาะบิลที่รอตรวจ และกดแล้วส่ง id ของบิลนั้น
  // วิธี: mock บิลรอตรวจกับบิลไม่ผ่าน → เช็กว่าบิลไม่ผ่านไม่มีปุ่ม → กดของบิลรอตรวจ → เช็กว่า recheck.mutate ได้ 'p1'
  it('"ตรวจอีกครั้ง" มีเฉพาะบิลที่รอตรวจ และกดแล้วส่ง id ของบิลนั้น', async () => {
    const user = userEvent.setup()
    setup([issue('p1', SlipStatus.PENDING, 'x'), issue('p2', SlipStatus.FAILED, 'y')])
    expect(within(item('2')).queryByRole('button', { name: 'ตรวจอีกครั้ง' })).not.toBeInTheDocument()
    await user.click(within(item('1')).getByRole('button', { name: 'ตรวจอีกครั้ง' }))
    expect(recheck.mutate).toHaveBeenCalledWith('p1')
  })

  // ทดสอบ: ระหว่างกำลังตรวจ บิลนั้นขึ้น "กำลังตรวจ..." และปุ่มตรวจของทุกใบกดไม่ได้ กันยิงซ้ำ
  // วิธี: mock recheck เป็น isPending ของ p1 → เช็กว่าปุ่มของ p1 และ p3 กดไม่ได้ทั้งคู่
  it('กำลังตรวจ → บิลนั้นขึ้น "กำลังตรวจ..." ปุ่มตรวจทุกใบกดไม่ได้ (กันยิงซ้ำ)', () => {
    setup([issue('p1', SlipStatus.PENDING, 'x'), issue('p3', SlipStatus.PENDING, 'z')], Role.STAFF, {
      isPending: true,
      variables: 'p1',
    })
    expect(within(item('1')).getByRole('button', { name: 'กำลังตรวจ...' })).toBeDisabled()
    expect(within(item('3')).getByRole('button', { name: 'ตรวจอีกครั้ง' })).toBeDisabled()
  })

  // ทดสอบ: ตรวจสลิปซ้ำแล้วเกิด error ต้องแสดงข้อความ error
  // วิธี: mock recheck ให้มี error → เช็กข้อความใน alert
  it('ตรวจซ้ำแล้ว error → แสดงข้อความ error', () => {
    setup([issue('p1', SlipStatus.PENDING, 'x')], Role.STAFF, { error: new Error('SlipOK ไม่ตอบ') })
    expect(screen.getByRole('alert')).toHaveTextContent('SlipOK ไม่ตอบ')
  })

  // ทดสอบ: STAFF ไม่มีปุ่มยืนยันรับเงินเอง และคำแนะนำบอกให้แจ้งเจ้าของร้าน
  // วิธี: render เป็น STAFF กับบิลไม่ผ่าน → เช็กว่าไม่มีปุ่มยืนยันเอง และมีข้อความ "แจ้งเจ้าของร้าน"
  it('STAFF: ไม่มีปุ่มยืนยันเอง และคำแนะนำบอกให้แจ้งเจ้าของร้าน', () => {
    setup([issue('p2', SlipStatus.FAILED, 'y')], Role.STAFF)
    expect(screen.queryByRole('button', { name: 'ยืนยันเอง' })).not.toBeInTheDocument()
    expect(screen.getByText(/แจ้งเจ้าของร้าน/)).toBeInTheDocument()
  })

  // ทดสอบ: ADMIN ยืนยันรับเงินเองต้องใส่เหตุผล แล้วส่ง id + เหตุผล และพอสำเร็จกล่องต้องปิด
  // วิธี: render เป็น ADMIN → กดยืนยันเอง → เช็กรายละเอียดบิลในกล่อง และปุ่มกดไม่ได้ → ใส่เหตุผลแล้วกด → เช็ก payload → เรียก onSuccess → เช็กว่ากล่องปิด
  it('ADMIN ยืนยันเอง: ต้องใส่เหตุผล แล้วส่ง id + เหตุผล สำเร็จแล้วปิดกล่อง', async () => {
    const user = userEvent.setup()
    setup([issue('p2', SlipStatus.FAILED, 'ยอดไม่ตรง')], Role.ADMIN)
    expect(screen.getByText(/ยืนยันเอง/, { selector: 'p' })).toBeInTheDocument()
    await user.click(within(item('2')).getByRole('button', { name: 'ยืนยันเอง' }))

    const dialog = screen.getByRole('dialog', { name: 'ยืนยันรับเงินเอง' })
    expect(dialog).toHaveTextContent('โต๊ะ 2 · ฿350')
    expect(dialog).toHaveTextContent('ยอดไม่ตรง')
    const submit = within(dialog).getByRole('button', { name: 'ยืนยันว่าเงินเข้าแล้ว' })
    expect(submit).toBeDisabled()

    await user.type(within(dialog).getByLabelText(/เหตุผล/), 'เช็คแอปธนาคารแล้ว ยอดเข้า 19:42')
    await user.click(submit)
    expect(confirm.mutate).toHaveBeenCalledWith({ id: 'p2', reason: 'เช็คแอปธนาคารแล้ว ยอดเข้า 19:42' }, expect.anything())
    confirm.mutate.mock.calls[0][1].onSuccess()
    expect(await screen.findByRole('heading', { name: /สลิป PromptPay ที่ต้องตาม/ })).toBeInTheDocument()
    expect(screen.queryByRole('dialog', { name: 'ยืนยันรับเงินเอง' })).not.toBeInTheDocument()
  })

  // ทดสอบ: ADMIN กด "กลับ" ในกล่องยืนยัน ต้องปิดโดยไม่บันทึก
  // วิธี: render เป็น ADMIN → เปิดกล่องยืนยันเอง → กดกลับ → เช็กว่า mutate ไม่ถูกเรียก และกล่องปิด
  it('ADMIN กด "กลับ" ในกล่องยืนยัน → ปิดโดยไม่บันทึก', async () => {
    const user = userEvent.setup()
    setup([issue('p2', SlipStatus.FAILED, 'y')], Role.ADMIN)
    await user.click(screen.getByRole('button', { name: 'ยืนยันเอง' }))
    await user.click(within(screen.getByRole('dialog', { name: 'ยืนยันรับเงินเอง' })).getByRole('button', { name: 'กลับ' }))
    expect(confirm.mutate).not.toHaveBeenCalled()
    expect(screen.queryByRole('dialog', { name: 'ยืนยันรับเงินเอง' })).not.toBeInTheDocument()
  })
})
