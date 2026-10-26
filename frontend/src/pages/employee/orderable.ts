import type { MenuItem, MenuOptionGroup } from '@/types/models'

/**
 * หน้าพนักงานได้ตัวเลือกทั้งหมดมา รวมที่ปิดขาย/วัตถุดิบหมดด้วย (ไว้ใช้ในหน้าจัดการ)
 * ตอนรับออเดอร์ต้องกรองเหลือแค่ที่สั่งได้จริง ให้ตรงกับเมนูฝั่งลูกค้า
 */
export const orderableGroups = (item: MenuItem): MenuOptionGroup[] =>
  item.optionGroups
    .map((group) => ({
      ...group,
      options: group.options.filter((o) => o.isAvailable && !o.ingredientOutOfStock),
    }))
    .filter((group) => group.options.length > 0)

/** เมนูที่สั่งได้ตอนนี้ — เปิดขายอยู่ และวัตถุดิบหลักไม่หมด */
export const isOrderable = (item: MenuItem) =>
  item.isAvailable && item.ingredientsOutOfStock.length === 0
