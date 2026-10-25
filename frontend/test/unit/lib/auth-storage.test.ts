import { describe, expect, it } from 'vitest'
import { Role } from '@/types/enums'
import { authStorage } from '@/lib/auth-storage'

const user = { id: 'u1', email: 'a@x', name: 'A', role: Role.STAFF }

describe('authStorage', () => {
  // ทดสอบ: บันทึก อ่าน และล้าง token กับข้อมูลผู้ใช้ได้ถูก
  // วิธี: save token + user → เช็กว่าอ่านได้ตรง → clear → เช็กว่าเป็น null ทั้งคู่
  it('save / get / clear', () => {
    authStorage.save('tok', user)
    expect(authStorage.getToken()).toBe('tok')
    expect(authStorage.getUser()).toEqual(user)
    authStorage.clear()
    expect(authStorage.getToken()).toBeNull()
    expect(authStorage.getUser()).toBeNull()
  })

  // ทดสอบ: ข้อมูลผู้ใช้ใน localStorage เสีย (JSON พัง) ต้องได้ null ไม่ทำให้แอปพัง
  // วิธี: ใส่ '{not json' ลง restaurant.user → เช็กว่า getUser() ได้ null
  it('user ใน storage เสีย (JSON พัง) → null ไม่ throw', () => {
    localStorage.setItem('restaurant.user', '{not json')
    expect(authStorage.getUser()).toBeNull()
  })
})
