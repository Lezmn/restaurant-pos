import { describe, expect, it } from 'vitest'
import { hasNoteTag, isAllergyNote, toggleNoteTag } from './item-note'

describe('toggleNoteTag', () => {
  it('เพิ่มคำต่อท้ายข้อความที่พิมพ์ไว้ และเอาออกได้', () => {
    const added = toggleNoteTag('ข้าวน้อย', 'ไม่เผ็ด')
    expect(added).toBe('ข้าวน้อย, ไม่เผ็ด')
    expect(toggleNoteTag(added, 'ไม่เผ็ด')).toBe('ข้าวน้อย')
  })

  it('เทียบทั้งคำ — "เผ็ดมาก" ไม่นับเป็น "เผ็ด"', () => {
    expect(hasNoteTag('เผ็ดมาก', 'เผ็ด')).toBe(false)
    expect(hasNoteTag('ข้าวน้อย,ไม่เผ็ด', 'ไม่เผ็ด')).toBe(true)
  })

  it('ไม่เพิ่มถ้าเกินความยาวช่อง', () => {
    expect(toggleNoteTag('ก'.repeat(195), 'ไม่เผ็ด')).toBe('ก'.repeat(195))
  })
})

describe('isAllergyNote', () => {
  it.each(['แพ้กุ้ง', 'ลูกแพ้ถั่วนะคะ', 'กินเจ', 'peanut allergy'])('จับ "%s"', (note) => {
    expect(isAllergyNote(note)).toBe(true)
  })

  it.each(['ไม่เผ็ด', 'ไข่เจียวกรอบ ๆ', '', null])('ไม่จับ "%s"', (note) => {
    expect(isAllergyNote(note)).toBe(false)
  })
})
