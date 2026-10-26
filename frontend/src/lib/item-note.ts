/**
 * โน้ตต่อจานของร้านตามสั่ง — ปุ่มลัดระดับความเผ็ด แทนการพิมพ์เอง (ร้านขอให้เหลือแค่ 3 ปุ่มนี้)
 * เก็บเป็นข้อความธรรมดาใน note (คั่นด้วย ", ") backend ไม่ต้องรู้จักแท็กพวกนี้
 * อย่างอื่น (ไม่ใส่ผัก / แพ้กุ้ง) ลูกค้าพิมพ์เองได้ — คำว่า "แพ้" ยังขึ้นแดงบนจอครัว (isAllergyNote)
 */
export const NOTE_PRESETS = ['ไม่เผ็ด', 'เผ็ดน้อย', 'เผ็ดมาก'] as const

/** ระดับความเผ็ดเลือกได้อย่างเดียว — กดอันใหม่แทนอันเดิม */
const EXCLUSIVE_GROUPS: readonly (readonly string[])[] = [NOTE_PRESETS]

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
  const group = EXCLUSIVE_GROUPS.find((g) => g.includes(tag)) ?? []
  const next = current.includes(tag)
    ? current.filter((p) => p !== tag)
    : [...current.filter((p) => !group.includes(p)), tag]
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
