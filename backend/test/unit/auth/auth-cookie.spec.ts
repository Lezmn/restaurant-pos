import { AUTH_COOKIE, readAuthCookie, readStaffToken } from '../../../src/auth/auth-cookie';

describe('readAuthCookie', () => {
  // ทดสอบ: แกะ token จาก header Cookie ที่มีหลายค่า/มีช่องว่าง/ถูก encode
  // วิธี: ส่ง header แบบต่าง ๆ → เช็กว่าได้ token ตรง หรือ null เมื่อไม่มี/ว่าง/encode พัง
  it.each([
    [`${AUTH_COOKIE}=abc`, 'abc'],
    [`theme=dark; ${AUTH_COOKIE}=abc; other=1`, 'abc'],
    [`  ${AUTH_COOKIE} = a%2Eb `, 'a.b'],
    [`x${AUTH_COOKIE}=nope`, null],
    [`${AUTH_COOKIE}=`, null],
    [`${AUTH_COOKIE}=%E0%A4%A`, null],
    ['', null],
    [undefined, null],
    [123, null],
  ])('%j → %j', (header, expected) => {
    expect(readAuthCookie(header)).toBe(expected);
  });
});

describe('readStaffToken', () => {
  // ทดสอบ: Authorization: Bearer (Swagger/สคริปต์) มาก่อน cookie (หน้าเว็บ)
  // วิธี: ส่งทั้งสองแบบ → ได้ค่าจาก header; ส่งแค่ cookie → ได้ค่าจาก cookie; ไม่มีเลย → null
  it('Bearer ก่อน cookie', () => {
    expect(readStaffToken({ headers: { authorization: 'Bearer h', cookie: `${AUTH_COOKIE}=c` } })).toBe('h');
    expect(readStaffToken({ headers: { cookie: `${AUTH_COOKIE}=c` } })).toBe('c');
    expect(readStaffToken({ headers: { authorization: 'Basic x' } })).toBeNull();
    expect(readStaffToken({})).toBeNull();
  });
});
