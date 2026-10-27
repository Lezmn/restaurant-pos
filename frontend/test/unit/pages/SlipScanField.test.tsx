import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { readQrFromImage, SlipImageError } from '@/lib/slip-qr'
import { emptySlipInput, type SlipInput } from '@/pages/employee/slip-input'
import { SlipScanField } from '@/pages/employee/SlipScanField'

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
  // ทดสอบ: แนบรูปสลิปแล้วอ่าน QR ได้ ต้องเติมข้อความ (ตัดช่องว่างหัวท้าย) ลงช่องเดิม และปุ่มแนบรูปเปลี่ยนเป็นปุ่มล้าง
  // วิธี: mock ตัวอ่าน QR ให้คืนข้อความ → อัปโหลดรูป → เช็กค่าในช่อง ข้อความ "อ่าน QR ได้แล้ว" และปุ่มล้าง
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

  // ทดสอบ: รูปที่ไม่มี QR ต้องบอกให้ลองใหม่ ช่องยังว่าง และโฟกัสรอเครื่องสแกน
  // วิธี: mock ตัวอ่าน QR ให้คืน null → อัปโหลดรูป → เช็กข้อความ alert ช่องว่าง และช่องได้โฟกัส
  it('ไม่พบ QR ในรูป → บอกให้ลองใหม่ ช่องยังว่างและโฟกัสรอเครื่องสแกน', async () => {
    readQr.mockResolvedValue(null)
    render(<Harness />)

    await userEvent.upload(screen.getByLabelText('แนบรูปสลิป'), slipImage())

    expect(await screen.findByRole('alert')).toHaveTextContent('ไม่พบ QR ในรูป')
    expect(scanInput()).toHaveValue('')
    expect(scanInput()).toHaveFocus()
  })

  // ทดสอบ: ไฟล์รูปที่เปิดไม่ได้ ต้องแสดงเหตุผลที่ตัวอ่านแจ้งมา
  // วิธี: mock ตัวอ่านให้ throw SlipImageError → อัปโหลดรูป → เช็กข้อความ alert
  it('ไฟล์เปิดไม่ได้ → แสดงเหตุผลจากตัวอ่าน', async () => {
    readQr.mockImplementation(async () => {
      throw new SlipImageError('เปิดรูปนี้ไม่ได้ ลองใช้ไฟล์ JPG หรือ PNG')
    })
    render(<Harness />)

    await userEvent.upload(screen.getByLabelText('แนบรูปสลิป'), slipImage())

    expect(await screen.findByRole('alert')).toHaveTextContent('เปิดรูปนี้ไม่ได้')
  })

  // ทดสอบ: อ่านรูปไม่ผ่านแล้วพิมพ์หรือยิงเครื่องสแกนแทน ข้อความเตือนต้องหายไป
  // วิธี: mock ให้อ่านไม่เจอ → อัปโหลดรูปจนขึ้น alert → พิมพ์ ABC → เช็กว่า alert หาย
  it('พิมพ์/ยิงเครื่องสแกนหลังอ่านไม่ผ่าน → ข้อความเตือนหายไป', async () => {
    readQr.mockResolvedValue(null)
    render(<Harness />)
    await userEvent.upload(screen.getByLabelText('แนบรูปสลิป'), slipImage())
    await screen.findByRole('alert')

    await userEvent.type(scanInput(), 'ABC')

    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  // ทดสอบ: ADMIN ติ๊กยืนยันเองระหว่างที่ยังอ่านรูปอยู่ ผลจากรูปที่อ่านเสร็จทีหลังต้องไม่มาทับ
  // วิธี: mock ตัวอ่านให้ค้างไว้ → อัปโหลดรูป เช็กปุ่ม "กำลังอ่าน" กดไม่ได้ → ติ๊กยืนยันเอง → ปล่อยผลอ่าน → เช็กว่ายังติ๊กอยู่และช่องว่าง
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

  // ทดสอบ: ไฟล์ที่ไม่ใช่รูปภาพต้องถูกปฏิเสธด้วย SlipImageError ก่อนอ่าน
  // วิธี: เรียก readQrFromImage ตัวจริงด้วยไฟล์ PDF → เช็กว่า reject เป็น SlipImageError
  it('ไม่ใช่รูปภาพ → SlipImageError', async () => {
    const real = await actual()
    const pdf = new File(['x'], 'slip.pdf', { type: 'application/pdf' })
    await expect(real.readQrFromImage(pdf)).rejects.toThrow(real.SlipImageError)
  })

  // ทดสอบ: รูปใหญ่เกิน 20 MB ต้องถูกปฏิเสธด้วยข้อความว่าใหญ่เกินไป
  // วิธี: เรียก readQrFromImage ตัวจริงด้วยไฟล์ 21 MB → เช็กว่า reject ด้วย "ใหญ่เกินไป"
  it('รูปใหญ่เกิน 20 MB → SlipImageError', async () => {
    const real = await actual()
    const big = new File([new Uint8Array(21 * 1024 * 1024)], 'big.jpg', { type: 'image/jpeg' })
    await expect(real.readQrFromImage(big)).rejects.toThrow('ใหญ่เกินไป')
  })
})
