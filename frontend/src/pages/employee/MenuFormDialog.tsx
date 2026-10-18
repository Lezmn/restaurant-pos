import { button, field, fieldLabel } from '@/components/ui/styles'
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
  onDelete,
  onSubmit,
}: {
  /** ไม่ส่งมา = โหมดเพิ่มเมนูใหม่ */
  item?: MenuItem
  isSaving: boolean
  error: unknown
  onCancel: () => void
  /** โหมดแก้ไขเท่านั้น — ลบเมนูนี้ (เปิดกล่องยืนยันต่อ) */
  onDelete?: () => void
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
          <span className={fieldLabel}>ชื่อเมนู</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="เช่น ข้าวผัดกะเพรา"
            className={field}
          />
        </label>

        <div className="grid grid-cols-2 gap-3">
          <label className="block text-sm">
            <span className={fieldLabel}>ราคา (บาท)</span>
            <input
              type="number"
              min="0"
              step="1"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              className={field}
            />
          </label>

          <label className="block text-sm">
            <span className={fieldLabel}>หมวดหมู่</span>
            <select
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
              className={field}
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
          <span className={fieldLabel}>ลิงก์รูปภาพ</span>
          <input
            value={imageUrl}
            onChange={(e) => setImageUrl(e.target.value)}
            placeholder="https://... (ไม่ใส่ก็ได้)"
            className={field}
          />
        </label>

        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={isAvailable}
            onChange={(e) => setIsAvailable(e.target.checked)}
            className="h-5 w-5"
          />
          <span className={fieldLabel}>พร้อมจำหน่าย</span>
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
            className={button('secondary', 'lg')}
          >
            ยกเลิก
          </button>
          <button
            type="submit"
            disabled={isSaving}
            className={button('primary', 'lg')}
          >
            {isSaving ? 'กำลังบันทึก...' : 'บันทึก'}
          </button>
        </div>

        {/* แยกโซนอันตรายไว้ล่างสุด ห่างจากปุ่มบันทึก */}
        {item && onDelete && (
          <div className="mt-2 border-t border-gray-200 pt-4">
            <button
              type="button"
              onClick={onDelete}
              className={`${button('danger-outline')} w-full`}
            >
              ลบเมนูนี้
            </button>
            <p className="mt-1 text-center text-sm text-gray-600">
              เมนูที่เคยถูกสั่งแล้วลบไม่ได้ ให้ปิดขายแทน
            </p>
          </div>
        )}
      </form>
    </Modal>
  )
}
