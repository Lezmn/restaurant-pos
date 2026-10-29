import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { useAttachSlip } from '@/features/payments/hooks'
import { PaymentMethod, PaymentStatus, SlipStatus } from '@/types/enums'
import type { Payment } from '@/types/models'
import { AttachSlipDialog } from '@/pages/employee/AttachSlipDialog'

vi.mock('@/features/payments/hooks', () => ({ useAttachSlip: vi.fn() }))

beforeAll(() => {
  HTMLDialogElement.prototype.showModal ??= function (this: HTMLDialogElement) {
    this.open = true
  }
  HTMLDialogElement.prototype.close ??= function (this: HTMLDialogElement) {
    this.open = false
  }
})

const bill = (slip: Payment['slip']): Payment => ({
  id: 'pay-1',
  tableSessionId: 's-1',
  tableName: '3',
  placeLabel: 'โต๊ะ 3',
  isTakeaway: false,
  method: PaymentMethod.PROMPTPAY,
  status: PaymentStatus.COMPLETED,
  amount: 120,
  paidAt: '2026-10-29T12:00:00.000Z',
  voidedAt: null,
  voidReason: null,
  note: null,
  receipt: { number: 'RCPT-1' } as Payment['receipt'],
  slip,
})

const slipOf = (status: SlipStatus, message: string | null = null): Payment['slip'] => ({
  status,
  transRef: null,
  message,
  attempts: 1,
  overrideReason: null,
  overrideByName: null,
})

/** ส่งสลิปแล้ว backend ตอบบิลที่อัปเดตกลับมาเป็น result */
async function submitWith(result: Payment) {
  const mutate = vi.fn((_vars, opts: { onSuccess: (p: Payment) => void }) => opts.onSuccess(result))
  vi.mocked(useAttachSlip).mockReturnValue({ mutate, isPending: false, error: null } as never)
  const onClose = vi.fn()
  render(<AttachSlipDialog payment={bill(slipOf(SlipStatus.AWAITING))} onClose={onClose} />)
  await userEvent.type(screen.getByPlaceholderText(/ยิงเครื่องสแกน/), 'QR-PAYLOAD')
  await userEvent.click(screen.getByRole('button', { name: 'ตรวจสลิป' }))
  return onClose
}

describe('AttachSlipDialog', () => {
  it('ตรวจผ่าน → ปิดกล่อง', async () => {
    const onClose = await submitWith(bill(slipOf(SlipStatus.VERIFIED)))
    expect(onClose).toHaveBeenCalled()
  })

  it('SlipOK ตรวจไม่ได้ (รอตรวจ) → ไม่ปิดเงียบ แจ้งสาเหตุให้แคชเชียร์รู้', async () => {
    const onClose = await submitWith(bill(slipOf(SlipStatus.PENDING, 'ยังไม่ได้ตั้งค่า SlipOK')))
    expect(onClose).not.toHaveBeenCalled()
    expect(screen.getByRole('alert')).toHaveTextContent('SlipOK ยังตรวจสลิปนี้ไม่ได้')
    expect(screen.getByRole('alert')).toHaveTextContent('สาเหตุ: ยังไม่ได้ตั้งค่า SlipOK')

    await userEvent.click(screen.getByRole('button', { name: 'รับทราบ' }))
    expect(onClose).toHaveBeenCalled()
  })
})
