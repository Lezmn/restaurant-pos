import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { readQrFromImage, SlipImageError } from '@/lib/slip-qr'

// jsdom ไม่มี createImageBitmap / canvas / BarcodeDetector — mock ทั้งหมด แล้วเทสลำดับการลองอ่าน
const jsQR = vi.hoisted(() => vi.fn())
vi.mock('jsqr', () => ({ default: jsQR }))

const image = (size = 1000, type = 'image/png') => ({ type, size }) as Blob

let bitmap: { width: number; height: number; close: ReturnType<typeof vi.fn> }
let ctx: { drawImage: ReturnType<typeof vi.fn>; getImageData: ReturnType<typeof vi.fn> }
let canvasSizes: [number, number][]

beforeEach(() => {
  bitmap = { width: 4000, height: 3000, close: vi.fn() }
  vi.stubGlobal('createImageBitmap', vi.fn(async () => bitmap))
  canvasSizes = []
  ctx = {
    drawImage: vi.fn((_b, _x, _y, w: number, h: number) => canvasSizes.push([w, h])),
    getImageData: vi.fn(() => ({ data: new Uint8ClampedArray(4), width: 1, height: 1 })),
  }
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(ctx as never)
  jsQR.mockReset()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('readQrFromImage', () => {
  // ทดสอบ: ไฟล์ที่ไม่ใช่รูป / ใหญ่เกิน 20 MB ต้องปฏิเสธก่อนเปิดไฟล์
  it('ไม่ใช่รูป หรือใหญ่เกิน 20 MB → SlipImageError โดยไม่เปิดไฟล์', async () => {
    await expect(readQrFromImage(image(1000, 'application/pdf'))).rejects.toThrow('ไฟล์นี้ไม่ใช่รูปภาพ')
    await expect(readQrFromImage(image(21 * 1024 * 1024))).rejects.toBeInstanceOf(SlipImageError)
    expect(createImageBitmap).not.toHaveBeenCalled()
  })

  // ทดสอบ: เบราว์เซอร์เปิดรูปไม่ได้ (ไฟล์เสีย/HEIC) ต้องบอกให้ใช้ JPG/PNG
  it('เปิดรูปไม่ได้ → SlipImageError แนะนำ JPG/PNG', async () => {
    vi.mocked(createImageBitmap).mockRejectedValueOnce(new Error('decode'))
    await expect(readQrFromImage(image())).rejects.toThrow(/JPG หรือ PNG/)
  })

  // ทดสอบ: เครื่องมี BarcodeDetector → ใช้ตัวในเครื่องก่อน ข้าม QR ว่าง และไม่โหลด jsQR
  it('มี BarcodeDetector → ใช้ค่าแรกที่ไม่ว่าง ไม่เรียก jsQR และปิด bitmap', async () => {
    const detect = vi.fn(async () => [{ rawValue: '  ' }, { rawValue: 'SLIP-PAYLOAD' }])
    const Detector = vi.fn(function () { return { detect } })
    vi.stubGlobal('BarcodeDetector', Detector)
    await expect(readQrFromImage(image())).resolves.toBe('SLIP-PAYLOAD')
    expect(Detector).toHaveBeenCalledWith({ formats: ['qr_code'] })
    expect(jsQR).not.toHaveBeenCalled()
    expect(bitmap.close).toHaveBeenCalled()
  })

  // ทดสอบ: BarcodeDetector พัง (ไม่รองรับ qr_code) หรือหาไม่เจอ → ลอง jsQR ต่อ
  it.each([
    ['detect throw', vi.fn(async () => { throw new Error('unsupported') })],
    ['หาไม่เจอ', vi.fn(async () => [])],
  ])('BarcodeDetector %s → ลอง jsQR ต่อ', async (_label, detect) => {
    vi.stubGlobal('BarcodeDetector', vi.fn(function () { return { detect } }))
    jsQR.mockReturnValueOnce({ data: 'FROM-JSQR' })
    await expect(readQrFromImage(image())).resolves.toBe('FROM-JSQR')
  })

  // ทดสอบ: ไม่มี BarcodeDetector → jsQR ลองขนาดเล็ก (1600) ก่อน ไม่เจอค่อยลองใหญ่ (3000)
  it('jsQR ลอง 1600px ก่อน ไม่เจอค่อยลอง 3000px', async () => {
    jsQR.mockReturnValueOnce(null).mockReturnValueOnce({ data: 'BIG' })
    await expect(readQrFromImage(image())).resolves.toBe('BIG')
    expect(canvasSizes).toEqual([
      [1600, 1200],
      [3000, 2250],
    ])
  })

  // ทดสอบ: รูปเล็กกว่า 1600 อยู่แล้ว ลองขนาดจริงครั้งเดียว ไม่ขยายรูป
  it('รูปเล็กกว่า 1600px → ลองขนาดจริงครั้งเดียว ไม่เจอคืน null', async () => {
    bitmap.width = 800
    bitmap.height = 600
    jsQR.mockReturnValue({ data: '   ' })
    await expect(readQrFromImage(image())).resolves.toBeNull()
    expect(canvasSizes).toEqual([[800, 600]])
    expect(bitmap.close).toHaveBeenCalled()
  })

  // ทดสอบ: ได้ canvas context ไม่ได้ → คืน null ไม่ throw
  it('ไม่มี canvas 2d context → null', async () => {
    vi.mocked(HTMLCanvasElement.prototype.getContext).mockReturnValue(null)
    await expect(readQrFromImage(image())).resolves.toBeNull()
    expect(jsQR).not.toHaveBeenCalled()
  })
})
