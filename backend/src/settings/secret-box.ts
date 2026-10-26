import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

/**
 * เข้ารหัสค่าลับก่อนเก็บลง DB (AES-256-GCM) — DB หลุด/ถูก dump ก็อ่าน token ไม่ออก
 * กุญแจ: SETTINGS_SECRET ใน .env (ไม่ตั้ง = ใช้ JWT_SECRET แทน ส่งมอบร้านได้โดยไม่ต้องเพิ่มค่าใหม่)
 * เปลี่ยนกุญแจ = ถอดค่าเดิมไม่ได้ → หน้าตั้งค่าจะบอกให้วาง token ใหม่ (ไม่พังทั้งระบบ)
 *
 * รูปแบบที่เก็บ: "v1:<iv>:<tag>:<ciphertext>" (base64)
 */
const VERSION = 'v1';

const keyFrom = (secret: string) => createHash('sha256').update(secret).digest();

export function sealSecret(plain: string, secret: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', keyFrom(secret), iv);
  const data = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [VERSION, iv.toString('base64'), tag.toString('base64'), data.toString('base64')].join(':');
}

/** คืน null ถ้าถอดไม่ได้ (กุญแจเปลี่ยน / ข้อมูลเสีย) — ไม่ throw */
export function openSecret(sealed: string, secret: string): string | null {
  const [version, iv, tag, data] = sealed.split(':');
  if (version !== VERSION || !iv || !tag || !data) return null;
  try {
    const decipher = createDecipheriv('aes-256-gcm', keyFrom(secret), Buffer.from(iv, 'base64'));
    decipher.setAuthTag(Buffer.from(tag, 'base64'));
    return Buffer.concat([decipher.update(Buffer.from(data, 'base64')), decipher.final()]).toString('utf8');
  } catch {
    return null;
  }
}

/** โชว์ให้รู้ว่าตั้งตัวไหนไว้ โดยไม่เปิดเผย token: "••••••ab12" */
export const maskSecret = (plain: string) => `••••••${plain.slice(-4)}`;
