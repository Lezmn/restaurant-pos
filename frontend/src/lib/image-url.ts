/**
 * ขอรูปขนาดพอดีกล่องจาก CDN ที่ย่อรูปให้ได้ผ่าน query string
 *
 * รูปเมนูที่อัปโหลดผ่านระบบถูกย่อเหลือ 1200px ตั้งแต่ก่อนอัปโหลดแล้ว (image-resize.ts)
 * แต่ลิงก์ภายนอก เช่น Unsplash ใน seed เป็นไฟล์ต้นฉบับ ~5000px / 3.5 MB ต่อรูป
 * หน้าเมนูมีหลายรูป = โหลด/ถอดรหัสรูปหลายสิบ MB ตอนเปิดหน้า → จอค้างตอนกดเปลี่ยนแท็บ
 *
 * width = ความกว้างที่แสดงจริง (CSS px) — ขอ 2 เท่าให้คมบนจอความละเอียดสูง
 * โดเมนอื่นคืนลิงก์เดิม (ไม่รู้ว่ารองรับ query แบบไหน)
 */
export function sizedImageUrl(src: string, width: number): string {
  let url: URL
  try {
    url = new URL(src)
  } catch {
    return src
  }
  if (url.hostname !== 'images.unsplash.com') return src

  // ไม่ทับค่าที่ลิงก์ตั้งมาเอง (เช่นคนวางลิงก์ที่ crop มาแล้ว)
  const set = (key: string, value: string) => {
    if (!url.searchParams.has(key)) url.searchParams.set(key, value)
  }
  set('w', String(Math.round(width * 2)))
  set('q', '70')
  set('auto', 'format')
  set('fit', 'crop')
  return url.toString()
}
