import type { MenuItem, MenuOption, MenuOptionGroup } from '@/types/models'

/** เมนู/ตัวเลือกสำหรับเทสหน้ารับออเดอร์ (TakeOrderDialog, TakeawayPage) */
export const option = (id: string, name: string, price = 0, extra: Partial<MenuOption> = {}): MenuOption => ({
  id,
  name,
  price,
  group: 'PROTEIN' as MenuOption['group'],
  isAvailable: true,
  ingredientId: null,
  ingredientName: null,
  ingredientOutOfStock: false,
  ingredientStockQty: null,
  usageQty: 0,
  ...extra,
})

export const proteinGroup = (options: MenuOption[]): MenuOptionGroup => ({
  id: 'PROTEIN',
  name: 'เนื้อสัตว์',
  selectType: 'single',
  required: true,
  options,
})

export const extraGroup = (options: MenuOption[]): MenuOptionGroup => ({
  id: 'EXTRA',
  name: 'เพิ่มเติม',
  selectType: 'multiple',
  required: false,
  options,
})

export const menu = (id: string, name: string, price: number, extra: Partial<MenuItem> = {}): MenuItem => ({
  id,
  categoryId: 'c-main',
  name,
  price,
  imageUrl: null,
  isAvailable: true,
  proteinRequired: false,
  optionGroups: [],
  ingredients: [],
  ingredientsOutOfStock: [],
  ...extra,
})

/** กะเพรา: เนื้อสัตว์บังคับ (หมู/ไก่ +0, กุ้ง +20, เนื้อปิดขาย) + ไข่ดาว +10 */
export const kaprao = menu('m-kaprao', 'กะเพรา', 60, {
  proteinRequired: true,
  optionGroups: [
    proteinGroup([
      option('o-pork', 'หมู'),
      option('o-chicken', 'ไก่'),
      option('o-shrimp', 'กุ้ง', 20),
      option('o-beef', 'เนื้อ', 30, { isAvailable: false }),
    ]),
    extraGroup([option('o-egg', 'ไข่ดาว', 10, { group: 'EXTRA' as MenuOption['group'] })]),
  ],
})

export const tea = menu('m-tea', 'ชาเย็น', 25, { categoryId: 'c-drink' })
export const soldOut = menu('m-tomyum', 'ต้มยำ', 120, { ingredientsOutOfStock: ['กุ้ง'] })
export const closed = menu('m-closed', 'ปิดขายอยู่', 50, { isAvailable: false })
