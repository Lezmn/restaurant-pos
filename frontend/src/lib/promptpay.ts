/**
 * สร้าง payload ของ PromptPay QR ตามมาตรฐาน EMVCo (EMV QR Code Specification)
 * ที่ธนาคารแห่งประเทศไทยกำหนดให้ใช้กับ PromptPay
 *
 * โครงสร้างเป็น TLV (Tag-Length-Value) ต่อกันเป็นสตริงเดียว
 * แล้วปิดท้ายด้วย checksum CRC-16 เพื่อให้แอปธนาคารตรวจได้ว่าข้อมูลไม่เพี้ยน
 *
 * เขียนเองแทนการลง library เพราะสเปกไม่ซับซ้อนและจะได้เห็นว่าข้างในมีอะไร
 */

const ID_PAYLOAD_FORMAT = '00'
const ID_POI_METHOD = '01'
const ID_MERCHANT_PROMPTPAY = '29'
const ID_CURRENCY = '53'
const ID_AMOUNT = '54'
const ID_COUNTRY = '58'
const ID_CRC = '63'

const PROMPTPAY_AID = 'A000000677010111'
const CURRENCY_THB = '764'
const COUNTRY_TH = 'TH'

/** ค่าคงที่ตามสเปก: 11 = QR ใช้ซ้ำได้, 12 = ใช้ครั้งเดียว (ระบุยอดเงิน) */
const POI_STATIC = '11'
const POI_DYNAMIC = '12'

/** ประกอบ field เดียว: tag + ความยาว 2 หลัก + ค่า */
const field = (id: string, value: string) =>
  `${id}${String(value.length).padStart(2, '0')}${value}`

/**
 * แปลงเบอร์มือถือเป็นรูปแบบที่สเปกกำหนด
 * 081-234-5678 → 0066812345678 (ตัด 0 หน้าออก ใส่รหัสประเทศ 66 แล้วเติม 0 ให้ครบ 13 หลัก)
 * ถ้าเป็นเลขบัตรประชาชน/เลขผู้เสียภาษี 13 หลัก ใช้ได้เลย
 */
function formatTarget(id: string) {
  const digits = id.replace(/\D/g, '')

  // เลขประจำตัวประชาชน / เลขผู้เสียภาษี
  if (digits.length === 13) return { tag: '02', value: digits }

  // เบอร์มือถือ — รับได้ทั้ง 0812345678 / +66812345678 / 66812345678
  // เดิมตัดแค่ 0 หน้า เลยได้ 0066 + 66812345678 = 15 หลัก แอปธนาคารหาบัญชีไม่เจอ
  const mobile = digits.startsWith('66') && digits.length === 11
    ? digits.slice(2)
    : digits.replace(/^0/, '')
  return { tag: '01', value: `0066${mobile}`.padStart(13, '0') }
}

/**
 * CRC-16/CCITT-FALSE — poly 0x1021, ค่าเริ่มต้น 0xFFFF
 * เป็นตัวที่สเปก EMVCo กำหนด ห้ามใช้ CRC16 ตัวอื่น
 */
function crc16(input: string) {
  let crc = 0xffff

  for (let i = 0; i < input.length; i++) {
    // payload เป็น ASCII ล้วน — codePointAt ให้ค่าเท่า charCodeAt
    crc ^= (input.codePointAt(i) ?? 0) << 8
    for (let bit = 0; bit < 8; bit++) {
      crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff
    }
  }

  return crc.toString(16).toUpperCase().padStart(4, '0')
}

/**
 * @param id     เบอร์พร้อมเพย์ หรือเลขประจำตัว 13 หลักของร้าน
 * @param amount ยอดเงิน — ถ้าใส่มา ลูกค้าจะไม่ต้องกรอกเอง
 */
export function buildPromptPayPayload(id: string, amount?: number): string {
  const target = formatTarget(id)

  const merchant =
    field('00', PROMPTPAY_AID) + field(target.tag, target.value)

  let payload =
    field(ID_PAYLOAD_FORMAT, '01') +
    field(ID_POI_METHOD, amount && amount > 0 ? POI_DYNAMIC : POI_STATIC) +
    field(ID_MERCHANT_PROMPTPAY, merchant) +
    field(ID_CURRENCY, CURRENCY_THB)

  if (amount && amount > 0) {
    payload += field(ID_AMOUNT, amount.toFixed(2))
  }

  payload += field(ID_COUNTRY, COUNTRY_TH)

  // checksum คิดจากข้อความทั้งหมดรวม "6304" ที่เป็นหัวของ field CRC เองด้วย
  const withCrcHeader = `${payload}${ID_CRC}04`
  return `${withCrcHeader}${crc16(withCrcHeader)}`
}
