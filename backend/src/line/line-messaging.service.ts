import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

const PUSH_URL = 'https://api.line.me/v2/bot/message/push';
/** LINE ช้า/ล่ม ห้ามทำให้งานของร้าน (ปิดยอด) ค้าง */
const TIMEOUT_MS = 5_000;
/** เพดานความยาวข้อความของ LINE (5,000 ตัวอักษร) */
const MAX_TEXT = 5_000;

/**
 * ส่งข้อความเข้า LINE ผ่าน Messaging API ของ LINE Official Account
 * (LINE Notify ปิดบริการแล้วตั้งแต่ 31 มี.ค. 2025)
 *
 * ตั้งค่าใน .env: LINE_CHANNEL_ACCESS_TOKEN (long-lived) + LINE_TO (User ID "U..." หรือ Group ID "C...")
 * ไม่ตั้ง = ข้ามเงียบ ๆ — ร้านที่ยังไม่สมัคร LINE OA ใช้ระบบได้ตามปกติ
 */
@Injectable()
export class LineMessagingService {
  private readonly logger = new Logger(LineMessagingService.name);

  constructor(private readonly config: ConfigService) {}

  get isConfigured() {
    return Boolean(this.token && this.to);
  }

  /** ชื่อร้านที่ใส่หัวข้อความ — RESTAURANT_NAME ใน .env (ไม่บังคับ) */
  get shopName() {
    return this.config.get<string>('RESTAURANT_NAME')?.trim() || '';
  }

  private get token() {
    return this.config.get<string>('LINE_CHANNEL_ACCESS_TOKEN')?.trim() || '';
  }

  private get to() {
    return this.config.get<string>('LINE_TO')?.trim() || '';
  }

  /** คืน true ถ้าส่งสำเร็จ — ไม่ throw ทุกกรณี (ผู้เรียกไม่ต้อง try/catch) */
  async push(text: string): Promise<boolean> {
    if (!this.isConfigured) return false;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const res = await fetch(PUSH_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.token}`,
        },
        body: JSON.stringify({
          to: this.to,
          messages: [{ type: 'text', text: text.slice(0, MAX_TEXT) }],
        }),
        signal: controller.signal,
      });
      if (!res.ok) {
        // 401 = token ผิด/หมดอายุ, 400 = LINE_TO ผิดหรือยังไม่ได้แอด OA เป็นเพื่อน, 429 = โควตาเดือนนี้หมด
        this.logger.warn(`ส่ง LINE ไม่สำเร็จ (${res.status}): ${(await res.text()).slice(0, 200)}`);
        return false;
      }
      return true;
    } catch (error) {
      this.logger.warn(`ส่ง LINE ไม่สำเร็จ: ${(error as Error).message}`);
      return false;
    } finally {
      clearTimeout(timer);
    }
  }
}
