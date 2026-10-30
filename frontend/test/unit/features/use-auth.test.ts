import { afterEach, describe, expect, it, vi } from 'vitest'
import { useAuth } from '@/features/auth/use-auth'
import { authStorage } from '@/lib/auth-storage'
import { Role } from '@/types/enums'

const user = { id: 'u1', email: 'a@x', name: 'A', role: Role.STAFF }

describe('useAuth', () => {
  afterEach(() => vi.unstubAllGlobals())

  // ทดสอบ: ออกจากระบบต้องให้ backend ลบ httpOnly cookie (JS ลบเองไม่ได้) และล้างข้อมูลผู้ใช้ในเครื่อง
  // วิธี: signIn → mock fetch → signOut → เช็กว่ายิง POST /auth/logout แบบ credentials include และ user เป็น null
  it('signOut → POST /auth/logout พร้อม cookie แล้วล้าง user', () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }))
    vi.stubGlobal('fetch', fetchMock)
    useAuth.getState().signIn(user)
    expect(authStorage.getUser()).toEqual(user)

    useAuth.getState().signOut()
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringMatching(/\/auth\/logout$/),
      expect.objectContaining({ method: 'POST', credentials: 'include' }),
    )
    expect(useAuth.getState().user).toBeNull()
    expect(authStorage.getUser()).toBeNull()
  })

  // ทดสอบ: เน็ตหลุดตอนกดออก ต้องยังออกจากหน้าจอได้ ไม่มี unhandled rejection
  // วิธี: mock fetch reject → signOut → เช็กว่า user เป็น null
  it('logout ยิงไม่ผ่าน → ยังออกจากหน้าจอได้', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')))
    useAuth.getState().signIn(user)
    useAuth.getState().signOut()
    await Promise.resolve()
    expect(useAuth.getState().user).toBeNull()
  })
})
