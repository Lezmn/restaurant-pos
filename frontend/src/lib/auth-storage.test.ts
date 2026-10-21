import { describe, expect, it } from 'vitest'
import { Role } from '@/types/enums'
import { authStorage } from './auth-storage'

const user = { id: 'u1', email: 'a@x', name: 'A', role: Role.STAFF }

describe('authStorage', () => {
  it('save / get / clear', () => {
    authStorage.save('tok', user)
    expect(authStorage.getToken()).toBe('tok')
    expect(authStorage.getUser()).toEqual(user)
    authStorage.clear()
    expect(authStorage.getToken()).toBeNull()
    expect(authStorage.getUser()).toBeNull()
  })

  it('user ใน storage เสีย (JSON พัง) → null ไม่ throw', () => {
    localStorage.setItem('restaurant.user', '{not json')
    expect(authStorage.getUser()).toBeNull()
  })
})
