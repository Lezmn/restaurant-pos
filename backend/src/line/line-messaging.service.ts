import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { LineSettingsService } from './line-settings.service';

const PUSH_URL = 'https://api.line.me/v2/bot/message/push';
/** LINE ช้า/ล่ม ห้ามทำให้งานของร้าน (ปิดยอด) ค้าง */
const TIMEOUT_MS = 5_000;
/** เพดานความยาวข้อความของ LINE (5,000 ตัวอักษร) */
const MAX_TEXT = 5_000;

export type LineSendResult = { ok: true } | { ok: false; status: number | null; message: string };

/** แปลงผลจาก LINE เป็นข้อความที่เจ้าของร้านเข้าใจและแก้เองได้ */
function explain(status: number | null, body: string): string {
  if (status === null) return 'ต่อ LINE ไม่ได้ (เน็ตของเซิร์ฟเวอร์ หรือ LINE ขัดข้อง) — ลองใหม่อีกครั้ง';
  if (status === 401) return 'Channel access token ไม่ถูกต้องหรือถูกยกเลิกแล้ว — ออก token ใหม่แล้ววางอีกครั้ง';
  if (status === 429) return 'โควตาข้อความของ LINE OA เดือนนี้หมดแล้ว (ดูแพ็กเกจใน LINE OA Manager)';
  if (status === 400 && /to/i.test(body)) {
    return 'User ID / Group ID ไม่ถูกต้อง — ใช้ "Your user ID" จากแท็บ Basic settings (ขึ้นต้นด้วย U)';
  }
  if (status === 400 || status === 403) {
    return 'LINE ไม่ยอมส่ง — ตรวจว่าแอด LINE OA เป็นเพื่อนแล้ว และ User ID เป็นของ channel นี้';
  }
  return `LINE ตอบกลับผิดปกติ (${status})`;
}

/**
 * ส่งข้อความเข้า LINE ผ่าน Messaging API ของ LINE Official Account
 * (LINE Notify ปิดบริการแล้วตั้งแต่ 31 มี.ค. 2025)
 *
 * token / ปลายทาง ตั้งจากหน้าเว็บ /owner/line (เก็บเข้ารหัสใน DB) หรือ .env (LINE_CHANNEL_ACCESS_TOKEN + LINE_TO)
 * ยังไม่ตั้ง / ปิดไว้ = ข้ามเงียบ ๆ — ร้านที่ยังไม่สมัคร LINE OA ใช้ระบบได้ตามปกติ
 *
 * LINE_DISABLED=true (ใน .env) = ไม่ยิง LINE เลยไม่ว่าใน DB จะตั้งไว้อย่างไร — ใช้กับ API ทดสอบ/E2E
 * เพราะ DB ทดสอบอาจมี token จริงค้างอยู่ แล้วเทสต์ปิดยอดจะส่งสรุปปลอมเข้า LINE ของเจ้าของร้าน
 */
@Injectable()
export class LineMessagingService {
  private readonly logger = new Logger(LineMessagingService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly settings: LineSettingsService,
  ) {}

  /** ชื่อร้านที่ใส่หัวข้อความ — RESTAURANT_NAME ใน .env (ไม่บังคับ) */
  get shopName() {
    return this.config.get<string>('RESTAURANT_NAME')?.trim() || '';
  }

  /** LINE_DISABLED=true — ปิดการส่งทั้งระบบ (เครื่องทดสอบ) */
  get disabled() {
    return this.config.get<string>('LINE_DISABLED')?.trim().toLowerCase() === 'true';
  }

  /** ส่งตามค่าที่ตั้งไว้ — คืน true ถ้าส่งสำเร็จ ไม่ throw ทุกกรณี (ผู้เรียกไม่ต้อง try/catch) */
  async push(text: string): Promise<boolean> {
    if (this.disabled) {
      this.logger.log('ข้ามการส่ง LINE (LINE_DISABLED=true)');
      return false;
    }
    let cfg;
    try {
      cfg = await this.settings.get();
    } catch (error) {
      this.logger.warn(`อ่านค่าตั้งค่า LINE ไม่ได้: ${(error as Error).message}`);
      return false;
    }
    if (!cfg.enabled || !cfg.token || !cfg.to) return false;

    const result = await this.send(cfg.token, cfg.to, text);
    if (!result.ok) this.logger.warn(`ส่ง LINE ไม่สำเร็จ: ${result.message}`);
    return result.ok;
  }

  /** ส่งด้วย token/ปลายทางที่ระบุ — ใช้ตอนกด "ส่งข้อความทดสอบ" (บอกสาเหตุถ้าไม่สำเร็จ) */
  async send(token: string, to: string, text: string): Promise<LineSendResult> {
    // ทางเดียวที่ออกไป LINE — กันตรงนี้จึงครอบทั้งสรุปปิดยอดและปุ่มส่งข้อความทดสอบ
    if (this.disabled) {
      return { ok: false, status: null, message: 'เซิร์ฟเวอร์นี้ปิดการส่ง LINE ไว้ (LINE_DISABLED=true)' };
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const res = await fetch(PUSH_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          to,
          messages: [{ type: 'text', text: text.slice(0, MAX_TEXT) }],
        }),
        signal: controller.signal,
      });
      if (res.ok) return { ok: true };
      const body = (await res.text()).slice(0, 300);
      return { ok: false, status: res.status, message: explain(res.status, body) };
    } catch {
      return { ok: false, status: null, message: explain(null, '') };
    } finally {
      clearTimeout(timer);
    }
  }
}
