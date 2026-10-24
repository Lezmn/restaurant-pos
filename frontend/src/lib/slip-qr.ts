/**
 * อ่านข้อความ QR จากรูปสลิป (แคปหน้าจอ / รูปที่ลูกค้าส่งมา / ถ่ายจากจอมือถือ) — ทำในเบราว์เซอร์ล้วน
 * ได้ข้อความแบบเดียวกับที่เครื่องสแกนพิมพ์ให้ จึงส่งไปตรวจกับ SlipOK ทางเดิมได้เลย ไม่ต้องอัปโหลดหรือเก็บรูป
 */

/** รูปสลิปปกติไม่กี่ MB — กันไฟล์ใหญ่ผิดปกติไม่ให้ค้างหน้าจอ */
const MAX_FILE_BYTES = 20 * 1024 * 1024

/**
 * ขนาดด้านยาวที่ลองอ่าน เรียงจากเร็วไปช้า — QR บนสลิปเล็ก (มุมขวาล่าง) ย่อมากไปจะอ่านไม่ออก
 * รูปจากกล้องที่ใหญ่กว่านี้ค่อยลองขนาดใหญ่ขึ้นทีหลัง
 */
const DECODE_SIZES = [1600, 3000]

export class SlipImageError extends Error {}

/** BarcodeDetector ยังไม่อยู่ใน lib.dom ของ TypeScript — ประกาศเท่าที่ใช้ */
interface BarcodeDetectorLike {
  detect(source: ImageBitmapSource): Promise<{ rawValue: string }[]>
}
type BarcodeDetectorCtor = new (opts: { formats: string[] }) => BarcodeDetectorLike

/** คืนข้อความใน QR หรือ null ถ้าหาไม่เจอ — throw SlipImageError ถ้าไฟล์ไม่ใช่รูป/เปิดไม่ได้ */
export async function readQrFromImage(file: Blob): Promise<string | null> {
  if (!file.type.startsWith('image/')) throw new SlipImageError('ไฟล์นี้ไม่ใช่รูปภาพ')
  if (file.size > MAX_FILE_BYTES) throw new SlipImageError('รูปใหญ่เกินไป (เกิน 20 MB)')

  let bitmap: ImageBitmap
  try {
    bitmap = await createImageBitmap(file)
  } catch {
    throw new SlipImageError('เปิดรูปนี้ไม่ได้ ลองใช้ไฟล์ JPG หรือ PNG')
  }

  try {
    return (await detectNative(bitmap)) ?? (await detectJsQr(bitmap))
  } finally {
    bitmap.close()
  }
}

/** แท็บเล็ต Android / Mac มีตัวอ่าน QR ในเครื่อง — เร็วและทนรูปถ่ายจากจอกว่า jsQR */
async function detectNative(bitmap: ImageBitmap): Promise<string | null> {
  const Detector = (globalThis as { BarcodeDetector?: BarcodeDetectorCtor }).BarcodeDetector
  if (!Detector) return null
  try {
    const codes = await new Detector({ formats: ['qr_code'] }).detect(bitmap)
    return codes.find((c) => c.rawValue.trim() !== '')?.rawValue ?? null
  } catch {
    // บางเครื่องมี API แต่ไม่รองรับ qr_code — ไปใช้ jsQR แทน
    return null
  }
}

async function detectJsQr(bitmap: ImageBitmap): Promise<string | null> {
  // โหลดเฉพาะตอนแนบรูปจริง ไม่ให้หน้าอื่นต้องโหลดไปด้วย
  const { default: jsQR } = await import('jsqr')
  const longSide = Math.max(bitmap.width, bitmap.height)
  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) return null

  for (const size of DECODE_SIZES) {
    const scale = Math.min(1, size / longSide)
    canvas.width = Math.round(bitmap.width * scale)
    canvas.height = Math.round(bitmap.height * scale)
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
    const { data, width, height } = ctx.getImageData(0, 0, canvas.width, canvas.height)
    const code = jsQR(data, width, height)
    if (code?.data.trim()) return code.data
    // ขนาดเดิมของรูปแล้วยังไม่เจอ ลองใหญ่ขึ้นก็ไม่ได้อะไรเพิ่ม
    if (scale === 1) break
  }
  return null
}
