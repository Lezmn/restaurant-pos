import type { CookieOptions, Response } from 'express';

/**
 * JWT ของพนักงานเก็บใน httpOnly cookie — JavaScript ในหน้าเว็บอ่านไม่ได้
 * ถ้ามี XSS หลุดเข้ามา สคริปต์จะขโมย token ออกไปใช้นอกเครื่องไม่ได้ (ต่างจาก localStorage)
 *
 * SameSite=Lax: หน้าเว็บ (pos.ร้าน.com) กับ API (api.ร้าน.com) เป็น site เดียวกัน cookie จึงไปกับ fetch ได้
 * แต่เว็บอื่นยิง POST ข้ามมาจะไม่มี cookie ติดไป (กัน CSRF) — สองโดเมนจึงต้องอยู่ใต้โดเมนหลักเดียวกัน
 */
export const AUTH_COOKIE = 'restaurant_token';

const baseOptions = (): CookieOptions => ({
  httpOnly: true,
  // production อยู่หลัง HTTPS (Caddy) เสมอ — dev เป็น http://localhost ตั้ง secure ไม่ได้
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax',
  path: '/',
});

/** expiresAt = เวลาหมดอายุของ JWT — cookie หมดพร้อม token ไม่ค้างเกิน */
export function setAuthCookie(res: Response, token: string, expiresAt: Date | undefined) {
  res.cookie(AUTH_COOKIE, token, { ...baseOptions(), expires: expiresAt });
}

export function clearAuthCookie(res: Response) {
  res.clearCookie(AUTH_COOKIE, baseOptions());
}

/** อ่าน token จาก header `Cookie` ดิบ ๆ (ทั้ง REST และ socket.io handshake) — ไม่ต้องลง cookie-parser */
export function readAuthCookie(cookieHeader: unknown): string | null {
  if (typeof cookieHeader !== 'string') return null;
  for (const part of cookieHeader.split(';')) {
    const eq = part.indexOf('=');
    if (eq === -1 || part.slice(0, eq).trim() !== AUTH_COOKIE) continue;
    const value = part.slice(eq + 1).trim();
    if (!value) return null;
    try {
      return decodeURIComponent(value);
    } catch {
      return null;
    }
  }
  return null;
}

/** token ของพนักงานจาก request — header `Authorization: Bearer` (Swagger/สคริปต์) ก่อน แล้วค่อย cookie (หน้าเว็บ) */
export function readStaffToken(req: { headers?: Record<string, unknown> }): string | null {
  const auth = req.headers?.authorization;
  if (typeof auth === 'string' && auth.startsWith('Bearer ')) return auth.slice(7);
  return readAuthCookie(req.headers?.cookie);
}
