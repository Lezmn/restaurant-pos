import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { readQrFromImage, SlipImageError } from '@/lib/slip-qr'
import { emptySlipInput, type SlipInput } from './slip-input'
import { SlipScanField } from './SlipScanField'

// jsdom ไม่มี canvas/createImageBitmap — ตัวอ่าน QR จริงทดสอบในเบราว์เซอร์ ที่นี่เทสต์แค่พฤติกรรมของช่อง
vi.mock('@/lib/slip-qr', async (orig) => ({
  ...(await orig<typeof import('@/lib/slip-qr')>()),
  readQrFromImage: vi.fn(),
}))
const readQr = vi.mocked(readQrFromImage)

function Harness({ canOverride = false }: { canOverride?: boolean }) {
  const [slip, setSlip] = useState<SlipInput>(emptySlipInput)
  return <SlipScanField value={slip} onChange={setSlip} canOverride={canOverride} />
}

const slipImage = () => new File(['x'], 'slip.png', { type: 'image/png' })
const scanInput = () => screen.getByPlaceholderText(/ยิงเครื่องสแกน/)

// ห้ามคืนค่าจาก beforeEach — mockReset() คืนตัว mock แล้ว vitest จะเรียกมันเป็น teardown
beforeEach(() => {
  readQr.mockReset()
})

describe('SlipScanField — แนบรูปสลิป', () => {
  it('อ่าน QR จากรูปได้ → เติมข้อความลงช่องเดิม', async () => {
    readQr.mockResolvedValue('  0046000600000101030040220014242082547BPM049885102TH9104C1E4  ')
    render(<Harness />)

    await userEvent.upload(screen.getByLabelText('แนบรูปสลิป'), slipImage())

    await waitFor(() =>
      expect(scanInput()).toHaveValue('0046000600000101030040220014242082547BPM049885102TH9104C1E4'),
    )
    expect(screen.getByText(/อ่าน QR ได้แล้ว/)).toBeInTheDocument()
    // มีข้อความแล้ว ปุ่มแนบรูปหลบให้ปุ่มล้าง
    expect(screen.queryByRole('button', { name: /แนบรูป/ })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'ล้าง' })).toBeInTheDocument()
  })

  it('ไม่พบ QR ในรูป → บอกให้ลองใหม่ ช่องยังว่างและโฟกัสรอเครื่องสแกน', async () => {
    readQr.mockResolvedValue(null)
    render(<Harness />)

    await userEvent.upload(screen.getByLabelText('แนบรูปสลิป'), slipImage())

    expect(await screen.findByRole('alert')).toHaveTextContent('ไม่พบ QR ในรูป')
    expect(scanInput()).toHaveValue('')
    expect(scanInput()).toHaveFocus()
  })

  it('ไฟล์เปิดไม่ได้ → แสดงเหตุผลจากตัวอ่าน', async () => {
    readQr.mockImplementation(async () => {
      throw new SlipImageError('เปิดรูปนี้ไม่ได้ ลองใช้ไฟล์ JPG หรือ PNG')
    })
    render(<Harness />)

    await userEvent.upload(screen.getByLabelText('แนบรูปสลิป'), slipImage())

    expect(await screen.findByRole('alert')).toHaveTextContent('เปิดรูปนี้ไม่ได้')
  })

  it('พิมพ์/ยิงเครื่องสแกนหลังอ่านไม่ผ่าน → ข้อความเตือนหายไป', async () => {
    readQr.mockResolvedValue(null)
    render(<Harness />)
    await userEvent.upload(screen.getByLabelText('แนบรูปสลิป'), slipImage())
    await screen.findByRole('alert')

    await userEvent.type(scanInput(), 'ABC')

    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('ADMIN ติ๊กยืนยันเองระหว่างกำลังอ่านรูป → ไม่เอาผลจากรูปมาทับ', async () => {
    let finish!: (v: string) => void
    readQr.mockReturnValue(new Promise((r) => (finish = r)))
    render(<Harness canOverride />)

    await userEvent.upload(screen.getByLabelText('แนบรูปสลิป'), slipImage())
    expect(screen.getByRole('button', { name: /กำลังอ่าน/ })).toBeDisabled()
    await userEvent.click(screen.getByRole('checkbox'))
    finish('PAYLOAD')

    await waitFor(() => expect(screen.getByRole('checkbox')).toBeChecked())
    expect(scanInput()).toHaveValue('')
  })
})

describe('readQrFromImage — ตรวจไฟล์ก่อนอ่าน', () => {
  const actual = () => vi.importActual<typeof import('@/lib/slip-qr')>('@/lib/slip-qr')

  it('ไม่ใช่รูปภาพ → SlipImageError', async () => {
    const real = await actual()
    const pdf = new File(['x'], 'slip.pdf', { type: 'application/pdf' })
    await expect(real.readQrFromImage(pdf)).rejects.toThrow(real.SlipImageError)
  })

  it('รูปใหญ่เกิน 20 MB → SlipImageError', async () => {
    const real = await actual()
    const big = new File([new Uint8Array(21 * 1024 * 1024)], 'big.jpg', { type: 'image/jpeg' })
    await expect(real.readQrFromImage(big)).rejects.toThrow('ใหญ่เกินไป')
  })
})
