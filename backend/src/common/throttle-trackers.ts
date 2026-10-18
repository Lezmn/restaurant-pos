import { JwtService } from '@nestjs/jwt';

/**
 * ตัวระบุ "ใคร" สำหรับ rate limit
 *
 * ทำไมไม่นับตาม IP อย่างเดียว: ลูกค้าและพนักงานทุกคนในร้านออกเน็ตผ่าน IP เดียวกัน (NAT ของเราเตอร์)
 * ถ้านับรวมกัน 100 ครั้ง/นาที ช่วงคนแน่นร้านจะโดนบล็อกพร้อมกันทั้งร้าน
 * จึงนับแยกรายคน:
 *   - พนักงาน  → user id จาก JWT (ต้องตรวจลายเซ็นก่อน ไม่งั้นปลอม sub ใหม่ทุก request เพื่อเลี่ยงได้)
 *   - ลูกค้า   → sessionToken ของ QR โต๊ะ
 *   - นอกนั้น → IP (เช่น /auth/login)
 * ส่วนการปลอม token มั่ว ๆ เพื่อเลี่ยง limit มีเพดานต่อ IP (ipTracker) คุมอีกชั้น
 */
export function createIdentityTracker(jwt: JwtService) {
  return (req: Record<string, any>): string => {
    const auth: unknown = req.headers?.authorization;
    if (typeof auth === 'string' && auth.startsWith('Bearer ')) {
      try {
        const payload = jwt.verify<{ sub: string }>(auth.slice(7));
        return `user:${payload.sub}`;
      } catch {
        // token เสีย/หมดอายุ → นับตาม IP แทน (request จะโดน 401 ต่ออยู่แล้ว)
      }
    }

    const sessionToken = readSessionToken(req);
    if (sessionToken) return `session:${sessionToken}`;

    return ipTracker(req);
  };
}

export function ipTracker(req: Record<string, any>): string {
  return `ip:${req.ip ?? req.socket?.remoteAddress ?? 'unknown'}`;
}

/** token ของ QR มาได้ 3 ทาง: /public/sessions/:token, body.sessionToken, ?sessionToken= */
function readSessionToken(req: Record<string, any>): string | null {
  const candidates: unknown[] = [
    req.params?.token,
    req.body?.sessionToken,
    req.query?.sessionToken,
  ];
  const token = candidates.find(
    (value): value is string =>
      typeof value === 'string' && value.length > 0 && value.length <= 128,
  );
  return token ?? null;
}
