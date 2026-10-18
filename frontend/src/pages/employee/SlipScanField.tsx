import { useEffect, useRef } from 'react'

export interface SlipInput {
  /** ข้อความใน QR มุมขวาล่างของสลิป */
  payload: string
  /** ADMIN: ไม่มีสลิป ยืนยันเอง */
  override: boolean
  overrideReason: string
}

export const emptySlipInput: SlipInput = { payload: '', override: false, overrideReason: '' }

/** พร้อมบันทึกไหม — มีข้อความ QR หรือ ADMIN ยืนยันเองพร้อมเหตุผล */
export const isSlipReady = (slip: SlipInput) =>
  slip.override ? slip.overrideReason.trim() !== '' : slip.payload.trim() !== ''

/**
 * ช่องสแกนสลิป PromptPay — backend ส่งข้อความ QR ไปตรวจกับ SlipOK ก่อนบันทึก
 *
 * ใช้กับเครื่องสแกน 2D แบบคีย์บอร์ด (ยิงที่จอมือถือลูกค้าแล้วเครื่องพิมพ์ข้อความ + Enter ให้)
 * หรือวางข้อความเองก็ได้ — เปิดหน้ามาช่องนี้ focus รอไว้เลย ยิงได้ทันที
 * Enter จากเครื่องสแกนต้องไม่ไป submit ฟอร์ม (แคชเชียร์อาจยังแก้ยอดอยู่)
 */
export function SlipScanField({
  value,
  onChange,
  canOverride,
}: Readonly<{
  value: SlipInput
  onChange: (next: SlipInput) => void
  /** เฉพาะ ADMIN ยืนยันรับเงินเองได้เมื่อไม่มีสลิป */
  canOverride: boolean
}>) {
  const scanned = value.payload.trim() !== ''
  const inputRef = useRef<HTMLInputElement>(null)

  // focus หลัง <dialog> เปิดแล้ว — autoFocus ของ React ทำงานตอนกล่องยังปิดอยู่ (โฟกัสไม่ได้)
  // แล้ว showModal() ของ Modal ย้ายโฟกัสไปปุ่มแรกแทน ทำให้ยิงเครื่องสแกนแล้วข้อความไม่ลงช่อง
  useEffect(() => {
    const id = setTimeout(() => inputRef.current?.focus(), 0)
    return () => clearTimeout(id)
  }, [])

  return (
    <div className="mb-4 rounded-xl border-2 border-gray-200 p-3">
      <label className="block">
        <span className="text-sm font-semibold text-gray-700">
          สแกนสลิปของลูกค้า<span className="ml-1 text-danger">*</span>
        </span>
        <div className="mt-1 flex gap-2">
          <input
            ref={inputRef}
            value={value.payload}
            disabled={value.override}
            onChange={(e) => onChange({ ...value, payload: e.target.value })}
            onKeyDown={(e) => {
              if (e.key === 'Enter') e.preventDefault()
            }}
            placeholder="ยิงเครื่องสแกนที่ QR มุมขวาล่างของสลิป หรือวางข้อความ"
            maxLength={500}
            autoComplete="off"
            spellCheck={false}
            className={`min-w-0 flex-1 rounded border px-3 py-2 text-sm outline-none focus:bg-white disabled:opacity-50 ${
              scanned
                ? 'border-success bg-success/5 focus:border-success'
                : 'border-gray-300 bg-gray-100 focus:border-brand-300'
            }`}
          />
          {scanned && !value.override && (
            <button
              type="button"
              onClick={() => onChange({ ...value, payload: '' })}
              className="min-h-10 shrink-0 rounded-lg border border-gray-300 px-3 text-sm font-semibold text-gray-600 transition hover:bg-gray-50"
            >
              ล้าง
            </button>
          )}
        </div>
      </label>

      <p className={`mt-1 text-xs ${scanned ? 'text-success' : 'text-gray-500'}`}>
        {scanned
          ? '✓ อ่าน QR ได้แล้ว — กดบันทึกเพื่อตรวจกับ SlipOK (ยอด / บัญชีร้าน / สลิปซ้ำ)'
          : 'ระบบตรวจกับข้อมูลธนาคารผ่าน SlipOK — ดูแค่รูปสลิปไม่พอ สลิปปลอมทำได้ง่าย'}
      </p>

      {canOverride && (
        <div className="mt-3 border-t border-gray-200 pt-3">
          <label className="flex min-h-10 cursor-pointer items-center gap-2 text-sm text-gray-700">
            <input
              type="checkbox"
              checked={value.override}
              onChange={(e) => onChange({ ...value, override: e.target.checked })}
              className="h-5 w-5 accent-brand-300"
            />
            ไม่มีสลิปให้ตรวจ — ยืนยันรับเงินเอง (ADMIN)
          </label>
          {value.override && (
            <textarea
              value={value.overrideReason}
              onChange={(e) => onChange({ ...value, overrideReason: e.target.value })}
              rows={2}
              maxLength={200}
              placeholder="เหตุผล เช่น เช็คยอดเข้าในแอปธนาคารแล้ว ฿350 เวลา 19:42"
              className="mt-1 w-full resize-none rounded border border-gray-300 bg-gray-100 px-3 py-2 text-sm outline-none focus:border-brand-300 focus:bg-white"
            />
          )}
        </div>
      )}
    </div>
  )
}
