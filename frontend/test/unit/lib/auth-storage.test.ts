import { describe, expect, it } from 'vitest'
import { Role } from '@/types/enums'
import { authStorage } from '@/lib/auth-storage'

const user = { id: 'u1', email: 'a@x', name: 'A', role: Role.STAFF }

describe('authStorage', () => {
  // ทดสอบ: บันทึก อ่าน และล้างข้อมูลผู้ใช้ได้ถูก (JWT อยู่ใน httpOnly cookie ไม่ได้อยู่ที่นี่)
  // วิธี: save user → เช็กว่าอ่านได้ตรง → clear → เช็กว่าเป็น null
  it('save / get / clear', () => {
    authStorage.save(user)
    expect(authStorage.getUser()).toEqual(user)
    authStorage.clear()
    expect(authStorage.getUser()).toBeNull()
  })

  // ทดสอบ: token ที่เวอร์ชันก่อนเก็บใน localStorage ต้องถูกลบ ไม่ค้างให้สคริปต์อ่านได้
  // วิธี: ใส่ restaurant.token เก่า → save → หาย; ใส่อีกรอบ → clear → หาย
  it('ลบ token เก่าใน localStorage ตอน save และ clear', () => {
    localStorage.setItem('restaurant.token', 'old')
    authStorage.save(user)
    expect(localStorage.getItem('restaurant.token')).toBeNull()
    localStorage.setItem('restaurant.token', 'old')
    authStorage.clear()
    expect(localStorage.getItem('restaurant.token')).toBeNull()
  })

  // ทดสอบ: ข้อมูลผู้ใช้ใน localStorage เสีย (JSON พัง) ต้องได้ null ไม่ทำให้แอปพัง
  // วิธี: ใส่ '{not json' ลง restaurant.user → เช็กว่า getUser() ได้ null
  it('user ใน storage เสีย (JSON พัง) → null ไม่ throw', () => {
    localStorage.setItem('restaurant.user', '{not json')
    expect(authStorage.getUser()).toBeNull()
  })
})
