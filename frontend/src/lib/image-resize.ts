/** ด้านยาวสุดของรูปเมนูหลังย่อ — พอสำหรับการ์ดเมนูและหน้ารายละเอียดบนมือถือ/แท็บเล็ต */
export const MENU_IMAGE_MAX_SIDE = 1200

/**
 * ย่อรูปในเครื่องก่อนอัปโหลด — รูปจากมือถือมัก 3–8 MB ส่งตรงจะช้าและเกินเพดาน 2 MB ของ API
 * วาดลง canvas ใหม่ → WebP (เบราว์เซอร์ที่ไม่รองรับได้ JPEG) และตัดข้อมูลแฝงของรูปเดิม (EXIF/พิกัด GPS) ทิ้งไปด้วย
 */
export async function resizeImage(file: File, maxSide = MENU_IMAGE_MAX_SIDE): Promise<Blob> {
  // ไฟล์ที่ไม่ใช่รูป (หรือ HEIC บนคอมที่เปิดไม่ได้) — ข้อความของ browser เป็นภาษาอังกฤษ บอกเป็นภาษาคนแทน
  const bitmap = await createImageBitmap(file).catch(() => {
    throw new Error('เปิดไฟล์นี้เป็นรูปไม่ได้ — ใช้รูป JPG, PNG หรือ WebP')
  })
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height))
  const width = Math.round(bitmap.width * scale)
  const height = Math.round(bitmap.height * scale)

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('เบราว์เซอร์นี้ย่อรูปไม่ได้')
  ctx.drawImage(bitmap, 0, 0, width, height)
  bitmap.close()

  const toBlob = (type: string) =>
    new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, 0.82))
  // Safari รุ่นเก่าคืน PNG แทนเมื่อไม่รองรับ WebP — ถ้าไม่ได้ WebP ก็ใช้ JPEG
  const webp = await toBlob('image/webp')
  const blob = webp?.type === 'image/webp' ? webp : await toBlob('image/jpeg')
  if (!blob) throw new Error('ย่อรูปไม่สำเร็จ')
  return blob
}
