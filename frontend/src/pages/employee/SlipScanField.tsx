import { field, fieldLabel } from '@/components/ui/styles'
import { readQrFromImage, SlipImageError } from '@/lib/slip-qr'
import { useEffect, useRef, useState } from 'react'
import type { SlipInput } from './slip-input'
import { RequiredMark } from '@/components/ui/RequiredMark'

/**
 * ช่องสแกนสลิป PromptPay — backend ส่งข้อความ QR ไปตรวจกับ SlipOK ก่อนบันทึก
 *
 * ใช้กับเครื่องสแกน 2D แบบคีย์บอร์ด (ยิงที่จอมือถือลูกค้าแล้วเครื่องพิมพ์ข้อความ + Enter ให้)
 * หรือวางข้อความเองก็ได้ — เปิดหน้ามาช่องนี้ focus รอไว้เลย ยิงได้ทันที
 * Enter จากเครื่องสแกนต้องไม่ไป submit ฟอร์ม (แคชเชียร์อาจยังแก้ยอดอยู่)
 *
 * ไม่มีเครื่องสแกน: กด "แนบรูป" เลือกรูปสลิป/ถ่ายจากกล้องแท็บเล็ต — อ่าน QR ในเบราว์เซอร์แล้วเติมข้อความลงช่องเดิม
 * (รูปไม่ถูกส่งไปไหน)
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
  const fileRef = useRef<HTMLInputElement>(null)
  const [reading, setReading] = useState(false)
  const [imageError, setImageError] = useState<string | null>(null)
  // อ่านรูปใช้เวลา ระหว่างนั้นแคชเชียร์อาจติ๊กยืนยันเอง/ยิงเครื่องสแกนไปแล้ว — ใช้ค่าล่าสุด ไม่ใช่ค่าตอนกดปุ่ม
  const latest = useRef(value)
  useEffect(() => {
    latest.current = value
  }, [value])

  // focus หลัง <dialog> เปิดแล้ว — autoFocus ของ React ทำงานตอนกล่องยังปิดอยู่ (โฟกัสไม่ได้)
  // แล้ว showModal() ของ Modal ย้ายโฟกัสไปปุ่มแรกแทน ทำให้ยิงเครื่องสแกนแล้วข้อความไม่ลงช่อง
  useEffect(() => {
    const id = setTimeout(() => inputRef.current?.focus(), 0)
    return () => clearTimeout(id)
  }, [])

  const readImage = async (file: File) => {
    setReading(true)
    setImageError(null)
    try {
      const payload = await readQrFromImage(file)
      const current = latest.current
      if (current.override || current.payload.trim() !== '') return
      if (payload) {
        onChange({ ...current, payload: payload.trim() })
      } else {
        setImageError('ไม่พบ QR ในรูป — ให้เห็น QR มุมขวาล่างของสลิปชัด ๆ แล้วลองใหม่')
      }
    } catch (e) {
      setImageError(e instanceof SlipImageError ? e.message : 'อ่านรูปไม่สำเร็จ ลองใหม่อีกครั้ง')
    } finally {
      setReading(false)
      // อ่านไม่ได้ก็ยังยิงเครื่องสแกน/วางข้อความต่อได้ทันที
      inputRef.current?.focus()
    }
  }

  const hint = () => {
    if (reading) return 'กำลังอ่าน QR จากรูป…'
    if (scanned) return '✓ อ่าน QR ได้แล้ว — กดบันทึกเพื่อตรวจกับ SlipOK (ยอด / บัญชีร้าน / สลิปซ้ำ)'
    return 'ระบบตรวจกับข้อมูลธนาคารผ่าน SlipOK — ดูแค่รูปสลิปไม่พอ สลิปปลอมทำได้ง่าย'
  }

  return (
    <div className="mb-4 rounded-xl border-2 border-gray-200 p-3">
      <label className="block">
        <span className={fieldLabel}>
          สแกนสลิปของลูกค้า<RequiredMark />
        </span>
        <div className="mt-1 flex gap-2">
          <input
            ref={inputRef}
            value={value.payload}
            disabled={value.override}
            onChange={(e) => {
              setImageError(null)
              onChange({ ...value, payload: e.target.value })
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') e.preventDefault()
            }}
            placeholder="ยิงเครื่องสแกนที่ QR มุมขวาล่างของสลิป หรือวางข้อความ"
            maxLength={500}
            autoComplete="off"
            spellCheck={false}
            className={`min-h-11 min-w-0 flex-1 rounded-lg border px-3 py-2 text-sm outline-none transition focus:ring-2 disabled:opacity-50 ${
              scanned
                ? 'border-success bg-success/5 focus:border-success focus:ring-success/25'
                : 'border-gray-300 bg-white focus:border-brand-400 focus:ring-brand-400/25'
            }`}
          />
          {scanned && !value.override && (
            <button
              type="button"
              onClick={() => onChange({ ...value, payload: '' })}
              className="min-h-11 shrink-0 rounded-lg border border-gray-300 px-3 text-sm font-semibold text-gray-600 transition hover:bg-gray-50"
            >
              ล้าง
            </button>
          )}
          {!scanned && !value.override && (
            <button
              type="button"
              disabled={reading}
              onClick={() => fileRef.current?.click()}
              className="flex min-h-11 shrink-0 items-center gap-1.5 rounded-lg border border-gray-300 px-3 text-sm font-semibold text-gray-700 transition hover:bg-gray-50 disabled:opacity-50"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden className="h-4 w-4">
                <rect x="3" y="5" width="18" height="14" rx="2" />
                <circle cx="9" cy="10" r="1.5" />
                <path d="m21 16-5-5-8 8" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              {reading ? 'กำลังอ่าน…' : 'แนบรูป'}
            </button>
          )}
        </div>
      </label>
      {/* ไม่ใส่ capture — แท็บเล็ตจะให้เลือกได้ทั้งถ่ายจากกล้องหรือเลือกรูปในเครื่อง */}
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        aria-label="แนบรูปสลิป"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0]
          // ล้างค่าไว้ เลือกรูปเดิมซ้ำ (เช่นหลังครอปใหม่) จะได้ยิง change อีกรอบ
          e.target.value = ''
          if (file) void readImage(file)
        }}
      />

      {imageError ? (
        <p role="alert" className="mt-1 text-sm font-semibold text-danger-ink">
          {imageError}
        </p>
      ) : (
        <p className={`mt-1 text-sm ${scanned ? 'text-black' : 'text-gray-500'}`}>{hint()}</p>
      )}

      {canOverride && (
        <div className="mt-3 border-t border-gray-200 pt-3">
          <label className="flex min-h-11 cursor-pointer items-center gap-2 text-sm text-gray-700">
            <input
              type="checkbox"
              checked={value.override}
              onChange={(e) => onChange({ ...value, override: e.target.checked })}
              className="h-5 w-5 accent-brand-300"
            />
            <span>ไม่มีสลิปให้ตรวจ — ยืนยันรับเงินเอง (ADMIN)</span>
          </label>
          {value.override && (
            <textarea
              value={value.overrideReason}
              onChange={(e) => onChange({ ...value, overrideReason: e.target.value })}
              rows={2}
              maxLength={200}
              placeholder="เหตุผล เช่น เช็คยอดเข้าในแอปธนาคารแล้ว ฿350 เวลา 19:42"
              className={`${field} resize-none text-sm`}
            />
          )}
        </div>
      )}
    </div>
  )
}
