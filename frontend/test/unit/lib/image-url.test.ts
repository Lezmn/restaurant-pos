import { describe, expect, it } from 'vitest'
import { sizedImageUrl } from '@/lib/image-url'

describe('sizedImageUrl', () => {
  // ทดสอบ: ลิงก์ Unsplash ต้นฉบับ (~5000px / 3.5 MB) → ขอขนาด 2 เท่าของที่แสดง + บีบอัด + ฟอร์แมตอัตโนมัติ
  it('Unsplash → ขอรูปกว้าง 2 เท่าของที่แสดง พร้อม q/auto/fit', () => {
    const url = new URL(sizedImageUrl('https://images.unsplash.com/photo-123', 240))
    expect(url.searchParams.get('w')).toBe('480')
    expect(url.searchParams.get('q')).toBe('70')
    expect(url.searchParams.get('auto')).toBe('format')
    expect(url.searchParams.get('fit')).toBe('crop')
  })

  // ทดสอบ: ลิงก์ที่ตั้งขนาด/การ crop มาเองแล้ว ห้ามทับ
  it('ไม่ทับค่าที่ลิงก์ตั้งมาเอง', () => {
    const url = new URL(sizedImageUrl('https://images.unsplash.com/photo-123?w=300&fit=max', 240))
    expect(url.searchParams.get('w')).toBe('300')
    expect(url.searchParams.get('fit')).toBe('max')
    expect(url.searchParams.get('q')).toBe('70')
  })

  // ทดสอบ: โดเมนอื่น / รูปที่อัปโหลดเข้าระบบ / ลิงก์ไม่ใช่ URL → คืนลิงก์เดิมทุกตัวอักษร
  it.each([
    'https://example.com/padthai.jpg',
    'http://localhost:3000/uploads/menu/abc.webp',
    'not a url',
  ])('ไม่ใช่ Unsplash → คืนลิงก์เดิม: %s', (src) => {
    expect(sizedImageUrl(src, 240)).toBe(src)
  })
})
