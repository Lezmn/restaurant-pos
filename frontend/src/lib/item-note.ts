/**
 * โน้ตต่อจานของร้านตามสั่ง — ปุ่มลัดที่ลูกค้า/พนักงานกดบ่อย แทนการพิมพ์เอง
 * เก็บเป็นข้อความธรรมดาใน note (คั่นด้วย ", ") backend ไม่ต้องรู้จักแท็กพวกนี้
 */
export const NOTE_PRESETS = [
  'ไม่เผ็ด',
  'เผ็ดน้อย',
  'เผ็ดมาก',
  'ไม่ใส่ผัก',
  'ไม่ใส่ผงชูรส',
  'ไข่ดาวไม่สุก',
  'แยกน้ำ',
] as const

/** ปุ่มแพ้อาหาร — ครัวต้องเห็นชัดกว่าโน้ตทั่วไป (ขึ้นแดงบนตั๋ว) */
export const ALLERGY_PRESETS = ['แพ้กุ้ง', 'แพ้ถั่ว', 'แพ้นม', 'แพ้ไข่', 'มังสวิรัติ'] as const

const SEPARATOR = ', '

const parts = (note: string) =>
  note
    .split(/\s*,\s*/)
    .map((p) => p.trim())
    .filter(Boolean)

/** มีคำนี้อยู่ในโน้ตแล้วหรือยัง (เทียบทั้งคำ ไม่ใช่ substring — "เผ็ดมาก" ไม่นับเป็น "เผ็ด") */
export const hasNoteTag = (note: string, tag: string) => parts(note).includes(tag)

/** กดปุ่มลัด = เพิ่ม/เอาคำนั้นออกจากโน้ต ข้อความที่พิมพ์เองยังอยู่ครบ */
export function toggleNoteTag(note: string, tag: string, maxLength = 200): string {
  const current = parts(note)
  const next = current.includes(tag) ? current.filter((p) => p !== tag) : [...current, tag]
  const joined = next.join(SEPARATOR)
  // เกินความยาวช่อง = ไม่เพิ่ม (ดีกว่าตัดข้อความลูกค้าทิ้งเงียบ ๆ)
  return joined.length > maxLength ? note : joined
}

/**
 * โน้ตนี้เกี่ยวกับการแพ้อาหาร/ข้อห้ามที่ทำพลาดแล้วอันตรายไหม
 * จับจากคำที่ลูกค้าพิมพ์เองด้วย ไม่ใช่แค่ปุ่มลัด
 */
export const isAllergyNote = (note: string | null | undefined) =>
  // "เจ" เดี่ยว ๆ ไม่ได้ — ไปตรงกับ "ไข่เจียว" ต้องเป็น "กินเจ"/"อาหารเจ"
  Boolean(note && /แพ้|allerg|มังสวิรัติ|กินเจ|อาหารเจ|vegan|ห้ามใส่/i.test(note))
