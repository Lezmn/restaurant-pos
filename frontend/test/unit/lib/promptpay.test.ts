import { describe, expect, it } from 'vitest'
import { buildPromptPayPayload } from '@/lib/promptpay'

/** แยก TLV ระดับบน ไว้ตรวจโครงสร้าง */
function parseTlv(payload: string) {
  const out: Record<string, string> = {}
  let i = 0
  while (i < payload.length) {
    const id = payload.slice(i, i + 2)
    const len = Number(payload.slice(i + 2, i + 4))
    out[id] = payload.slice(i + 4, i + 4 + len)
    i += 4 + len
  }
  return out
}

/** CRC-16/CCITT-FALSE เขียนแยกจากโค้ดจริง */
function crc(input: string) {
  let c = 0xffff
  for (const ch of input) {
    c ^= ch.charCodeAt(0) << 8
    for (let b = 0; b < 8; b++) c = c & 0x8000 ? ((c << 1) ^ 0x1021) & 0xffff : (c << 1) & 0xffff
  }
  return c.toString(16).toUpperCase().padStart(4, '0')
}

describe('buildPromptPayPayload', () => {
  // ทดสอบ: QR PromptPay แบบไม่ระบุยอดต้องเป็นชนิดใช้ซ้ำ มีโครงสร้างตามมาตรฐาน EMVCo ครบ และ checksum ถูก
  // วิธี: สร้าง payload จากเบอร์ → แยก TLV แล้วเช็กแต่ละ tag (POI 11, ไม่มี tag 54, AID, เบอร์ 0066...) → คำนวณ CRC ด้วยโค้ดที่เขียนแยกไว้ในเทส แล้วเทียบ
  it('ไม่มียอด → QR แบบใช้ซ้ำ (POI 11) โครงสร้าง EMVCo ครบ และ CRC ถูก', () => {
    const p = buildPromptPayPayload('0812345678')
    const tlv = parseTlv(p)
    expect(tlv['00']).toBe('01')
    expect(tlv['01']).toBe('11')
    expect(tlv['54']).toBeUndefined()
    const merchant = parseTlv(tlv['29'])
    expect(merchant['00']).toBe('A000000677010111')
    expect(merchant['01']).toBe('0066812345678')
    expect(p.slice(-8, -4)).toBe('6304')
    expect(p.slice(-4)).toBe(crc(p.slice(0, -4)))
  })

  // ทดสอบ: QR PromptPay แบบระบุยอดต้องเป็นชนิดใช้ครั้งเดียว มียอดทศนิยม 2 ตำแหน่ง สกุลเงินบาท และ checksum ถูก
  // วิธี: สร้าง payload ยอด 235.5 → เช็ก tag 01 = 12, 54 = 235.50, 53 = 764, 58 = TH และ CRC
  it('มียอด → POI 12 + tag 54 ทศนิยม 2 ตำแหน่ง และ CRC ถูก', () => {
    const p = buildPromptPayPayload('081-234-5678', 235.5)
    const tlv = parseTlv(p)
    expect(tlv['01']).toBe('12')
    expect(tlv['54']).toBe('235.50')
    expect(tlv['53']).toBe('764')
    expect(tlv['58']).toBe('TH')
    expect(p.slice(-4)).toBe(crc(p.slice(0, -4)))
  })

  // ทดสอบ: เบอร์โทรเขียนแบบ +66 หรือ 66 ต้องได้ QR เหมือนแบบ 0
  // วิธี: สร้าง payload จาก 3 รูปแบบเบอร์ ยอดเดียวกัน → เช็กว่าได้ข้อความเท่ากัน
  it('รับเบอร์รูปแบบ +66 / 66 ได้ผลเดียวกับ 0', () => {
    const a = buildPromptPayPayload('0812345678', 100)
    expect(buildPromptPayPayload('+66812345678', 100)).toBe(a)
    expect(buildPromptPayPayload('66812345678', 100)).toBe(a)
  })

  // ทดสอบ: ใช้เลขผู้เสียภาษี 13 หลักแทนเบอร์ได้ (เก็บใน tag 02)
  // วิธี: สร้าง payload จากเลข 13 หลัก → เช็ก tag 02 ในข้อมูลร้านค้า
  it('เลขผู้เสียภาษี 13 หลัก → tag 02', () => {
    const tlv = parseTlv(buildPromptPayPayload('1234567890123'))
    const merchant = parseTlv(tlv['29'])
    expect(merchant['02']).toBe('1234567890123')
  })

  // ทดสอบ: ยอด 0 หรือติดลบต้องได้ QR แบบไม่ระบุยอด
  // วิธี: สร้าง payload ยอด 0 เช็กว่าไม่มี tag 54 → ยอด -5 เช็กว่า POI เป็น 11
  it('ยอด 0 หรือติดลบ → QR แบบไม่ระบุยอด', () => {
    expect(parseTlv(buildPromptPayPayload('0812345678', 0))['54']).toBeUndefined()
    expect(parseTlv(buildPromptPayPayload('0812345678', -5))['01']).toBe('11')
  })
})
