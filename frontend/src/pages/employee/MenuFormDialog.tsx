import { ErrorNote } from '@/components/ui/ErrorNote'
import { Modal } from '@/components/ui/Modal'
import { useCategories } from '@/features/menu/hooks'
import type { MenuItemInput, MenuOptionInput } from '@/features/menu/api'
import type { MenuItem } from '@/types/models'
import { useState } from 'react'
import { MenuOptionsEditor, PendingOptionsEditor } from './MenuOptionsEditor'

/** ฟอร์มเพิ่ม/แก้ไขเมนู — ใช้ตัวเดียวกันทั้งสองกรณี ต่างแค่ค่าเริ่มต้น */
export function MenuFormDialog({
  item,
  isSaving,
  error,
  onCancel,
  onSubmit,
}: {
  /** ไม่ส่งมา = โหมดเพิ่มเมนูใหม่ */
  item?: MenuItem
  isSaving: boolean
  error: unknown
  onCancel: () => void
  /** โหมดเพิ่มเมนูใหม่จะได้ options ที่ผู้ใช้ใส่ไว้มาด้วย (โหมดแก้ไขยิง API ตรงจาก editor เอง) */
  onSubmit: (input: MenuItemInput, pendingOptions: MenuOptionInput[]) => void
}) {
  const { data: categories } = useCategories()

  const [name, setName] = useState(item?.name ?? '')
  const [price, setPrice] = useState(String(item?.price ?? ''))
  const [imageUrl, setImageUrl] = useState(item?.imageUrl ?? '')
  const [categoryId, setCategoryId] = useState(item?.categoryId ?? '')
  const [isAvailable, setIsAvailable] = useState(item?.isAvailable ?? true)
  const [pendingOptions, setPendingOptions] = useState<MenuOptionInput[]>([])

  return (
    <Modal
      title={item ? `แก้ไข ${item.name}` : 'เพิ่มเมนูใหม่'}
      onClose={onCancel}
    >
      <form
        onSubmit={(e) => {
          e.preventDefault()
          onSubmit(
            {
              name,
                price: Number(price),
              imageUrl: imageUrl.trim() || null,
              categoryId: categoryId || (categories?.[0]?.id ?? ''),
              isAvailable,
            },
            pendingOptions,
          )
        }}
        className="space-y-3"
      >
        <ErrorNote error={error} />

        <label className="block text-sm">
          <span className="font-semibold text-gray-700">ชื่อเมนู</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="เช่น ข้าวผัดกะเพรา"
            className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 outline-none focus:border-brand-300"
          />
        </label>

        <div className="grid grid-cols-2 gap-3">
          <label className="block text-sm">
            <span className="font-semibold text-gray-700">ราคา (บาท)</span>
            <input
              type="number"
              min="0"
              step="1"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 outline-none focus:border-brand-300"
            />
          </label>

          <label className="block text-sm">
            <span className="font-semibold text-gray-700">หมวดหมู่</span>
            <select
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 outline-none focus:border-brand-300"
            >
              <option value="">เลือกหมวดหมู่</option>
              {categories?.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
        </div>

        <label className="block text-sm">
          <span className="font-semibold text-gray-700">ลิงก์รูปภาพ</span>
          <input
            value={imageUrl}
            onChange={(e) => setImageUrl(e.target.value)}
            placeholder="https://... (ไม่ใส่ก็ได้)"
            className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-xs outline-none focus:border-brand-300"
          />
        </label>

        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={isAvailable}
            onChange={(e) => setIsAvailable(e.target.checked)}
            className="h-5 w-5 accent-brand-300"
          />
          <span className="font-semibold text-gray-700">พร้อมจำหน่าย</span>
        </label>

        {/* โหมดแก้ไขยิง API ทันที; โหมดเพิ่มเมนูใหม่ยังไม่มี id จึงพักไว้ก่อนแล้วสร้างตามหลัง */}
        {item ? (
          <MenuOptionsEditor menuItemId={item.id} />
        ) : (
          <PendingOptionsEditor options={pendingOptions} onChange={setPendingOptions} />
        )}

        <div className="grid grid-cols-2 gap-3 pt-2">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg border-2 border-gray-300 py-2.5 text-sm font-bold text-gray-700 transition hover:bg-gray-50"
          >
            ยกเลิก
          </button>
          <button
            type="submit"
            disabled={isSaving}
            className="rounded-lg bg-brand-300 py-2.5 text-sm font-bold text-white transition hover:bg-brand-400 disabled:opacity-60"
          >
            {isSaving ? 'กำลังบันทึก...' : 'บันทึก'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
