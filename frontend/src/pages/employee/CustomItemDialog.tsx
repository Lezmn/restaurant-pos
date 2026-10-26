import { Modal } from '@/components/ui/Modal'
import { QuantityStepper } from '@/components/ui/QuantityStepper'
import { button, field, fieldLabel } from '@/components/ui/styles'
import type { CustomOrderLine } from '@/features/orders/api'
import { formatBaht } from '@/lib/format'
import { useState } from 'react'

/** รายการที่กดบ่อย — กดแล้วเติมชื่อให้ แก้ราคาได้ */
const QUICK_NAMES = ['ข้าวเพิ่ม', 'ไข่ดาว', 'ไข่เจียว', 'ใส่กล่อง', 'ถุงหิ้ว']

/**
 * รายการราคาเปิด — ของนอกเมนู พิมพ์ชื่อกับราคาเอง ส่งเข้าครัวพร้อมออเดอร์
 * backend เก็บประวัติทุกครั้ง (เจ้าของดูได้ที่ประวัติการทำรายการ) เพราะตั้งราคาได้อิสระ
 */
export function CustomItemDialog({
  onClose,
  onAdd,
}: Readonly<{
  onClose: () => void
  onAdd: (line: CustomOrderLine) => void
}>) {
  const [name, setName] = useState('')
  const [price, setPrice] = useState('')
  const [quantity, setQuantity] = useState(1)
  const [note, setNote] = useState('')

  const priceNum = Number(price)
  const priceValid =
    price.trim() !== '' && Number.isFinite(priceNum) && priceNum >= 0 && priceNum <= 100_000 &&
    Math.round(priceNum * 100) === priceNum * 100
  const canAdd = name.trim() !== '' && priceValid

  return (
    <Modal title="รายการพิเศษ (ราคาเปิด)" onClose={onClose}>
      <form
        onSubmit={(e) => {
          e.preventDefault()
          if (!canAdd) return
          onAdd({ name: name.trim(), price: priceNum, quantity, note: note.trim() })
        }}
      >
        <div className="flex flex-wrap gap-2">
          {QUICK_NAMES.map((quick) => (
            <button
              key={quick}
              type="button"
              onClick={() => setName(quick)}
              className={`min-h-10 rounded-full border-2 px-3 text-sm transition ${
                name === quick
                  ? 'border-brand-500 bg-brand-500 font-bold text-white'
                  : 'border-gray-300 bg-white text-gray-700 hover:border-brand-400'
              }`}
            >
              {quick}
            </button>
          ))}
        </div>

        <label className="mt-4 block">
          <span className={fieldLabel}>ชื่อรายการ</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={60}
            placeholder="เช่น ข้าวเพิ่ม, เมนูนอกรายการ"
            className={field}
          />
        </label>

        <label className="mt-3 block">
          <span className={fieldLabel}>ราคาต่อชิ้น (บาท)</span>
          <input
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            inputMode="decimal"
            placeholder="เช่น 10"
            className={field}
          />
          {price.trim() !== '' && !priceValid && (
            <span className="mt-1 block text-sm text-danger-ink">ราคาไม่ถูกต้อง (0 – 100,000 ทศนิยมไม่เกิน 2 ตำแหน่ง)</span>
          )}
        </label>

        <input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          maxLength={200}
          placeholder="หมายเหตุถึงครัว (ไม่บังคับ)"
          aria-label="หมายเหตุถึงครัว"
          className={`${field} mt-3`}
        />

        <p className="mt-3 text-sm text-gray-600">ทุกรายการราคาเปิดถูกบันทึกในประวัติการทำรายการ</p>

        <div className="mt-4 flex items-center justify-between gap-3">
          <QuantityStepper value={quantity} min={1} onChange={(n) => setQuantity(Math.max(1, n))} />
          <button type="submit" disabled={!canAdd} className={`${button('primary', 'lg')} flex-1`}>
            {canAdd ? `เพิ่ม ${formatBaht(priceNum * quantity)}` : 'ใส่ชื่อและราคาก่อน'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
