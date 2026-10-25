import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { printSettings } from '@/lib/print-settings'
import { PaymentMethod } from '@/types/enums'
import type { Payment } from '@/types/models'
import { ReceiptDialog } from '@/pages/employee/ReceiptDialog'

const payment = {
  id: 'p1',
  method: PaymentMethod.CASH,
  amount: 120,
  note: null,
  slip: null,
  receipt: {
    number: 'R-0001',
    tableName: '3',
    issuedAt: '2026-10-22T12:00:00.000Z',
    items: [{ id: 'i1', name: 'กะเพรา', quantity: 2, lineTotal: 120, note: null }],
    subtotal: 120,
    discount: 0,
    total: 120,
    note: null,
  },
} as unknown as Payment

// jsdom ยังไม่มี showModal ของ <dialog>
beforeAll(() => {
  HTMLDialogElement.prototype.showModal ??= function (this: HTMLDialogElement) {
    this.open = true
  }
  HTMLDialogElement.prototype.close ??= function (this: HTMLDialogElement) {
    this.open = false
  }
})

let print: ReturnType<typeof vi.fn>
beforeEach(() => {
  print = vi.fn()
  vi.stubGlobal('print', print)
})
afterEach(() => vi.unstubAllGlobals())

// รอให้ setTimeout ของ effect มีโอกาสทำงานก่อนเช็คว่า "ไม่พิมพ์"
const nextTask = () => new Promise((r) => setTimeout(r, 10))

describe('ReceiptDialog — พิมพ์ทันทีหลังรับเงิน', () => {
  // ทดสอบ: เครื่องที่ตั้งพิมพ์ทันทีไว้ และเพิ่งรับเงินเสร็จ ต้องสั่งพิมพ์ใบเสร็จ 1 ครั้งพอดี
  // วิธี: ตั้ง autoPrint เป็น true → render ใบเสร็จแบบ justPaid → รอจน print ถูกเรียก 1 ครั้ง แล้วรออีกรอบ เช็กว่ายังเป็น 1
  it('เครื่องนี้เปิดไว้ + เพิ่งรับเงิน → สั่งพิมพ์ 1 ครั้ง', async () => {
    printSettings.setAutoPrintReceipt(true)
    render(<ReceiptDialog payment={payment} justPaid onClose={() => {}} />)
    await waitFor(() => expect(print).toHaveBeenCalledTimes(1))
    await nextTask()
    expect(print).toHaveBeenCalledTimes(1)
  })

  // ทดสอบ: เปิดดูใบเสร็จย้อนหลัง (ไม่ใช่เพิ่งรับเงิน) ต้องไม่พิมพ์เอง แม้ตั้งพิมพ์ทันทีไว้
  // วิธี: ตั้ง autoPrint เป็น true → render ใบเสร็จโดยไม่ส่ง justPaid → รอแล้วเช็กว่า print ไม่ถูกเรียก
  it('เปิดดูย้อนหลัง (ไม่ใช่เพิ่งรับเงิน) → ไม่พิมพ์เอง', async () => {
    printSettings.setAutoPrintReceipt(true)
    render(<ReceiptDialog payment={payment} onClose={() => {}} />)
    await nextTask()
    expect(print).not.toHaveBeenCalled()
  })

  // ทดสอบ: เครื่องที่ไม่ได้ตั้งพิมพ์ทันทีต้องไม่พิมพ์เอง และติ๊กเปิดแล้วต้องจำค่าไว้ใช้ใบถัดไป โดยไม่พิมพ์ใบนี้ย้อนหลัง
  // วิธี: render แบบ justPaid โดยไม่ได้ตั้งค่า → เช็กว่าไม่พิมพ์ → ติ๊กช่องพิมพ์ทันที → เช็กว่าค่าถูกบันทึก และยังไม่พิมพ์
  it('เครื่องนี้ปิดไว้ → ไม่พิมพ์เอง, ติ๊กเปิดแล้วจำค่าไว้ใช้ใบถัดไป (ไม่พิมพ์ใบนี้)', async () => {
    render(<ReceiptDialog payment={payment} justPaid onClose={() => {}} />)
    await nextTask()
    expect(print).not.toHaveBeenCalled()
    await userEvent.click(screen.getByRole('checkbox', { name: /พิมพ์ใบเสร็จทันที/ }))
    expect(printSettings.getAutoPrintReceipt()).toBe(true)
    await nextTask()
    expect(print).not.toHaveBeenCalled()
  })
})
