import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'node:crypto';

/**
 * ผลตรวจสลิป 3 แบบ — ฝั่งรับเงินตัดสินใจจาก kind อย่างเดียว
 * - verified    : มีรายการโอนจริง ยอด/ผู้รับตรง (ข้อมูลมาจากธนาคาร ไม่ใช่จากรูปสลิป)
 * - rejected    : ตรวจแล้วไม่ผ่าน (สลิปปลอม/ซ้ำ/ยอดไม่ตรง/โอนผิดบัญชี) — ห้ามบันทึกว่าจ่ายแล้ว
 * - unavailable : ตรวจไม่ได้ตอนนี้ (ธนาคารขัดข้อง/ให้รอ/แพ็กเกจหมด/เน็ตล่ม) — บันทึกเป็นรอตรวจ แล้วตรวจซ้ำทีหลัง
 */
export type SlipCheckResult =
  | {
      kind: 'verified';
      transRef: string;
      amount: number;
      transAt: Date;
      sendingBank: string | null;
      receivingBank: string | null;
    }
  | { kind: 'rejected'; code: number | null; message: string }
  | { kind: 'unavailable'; code: number | null; message: string };

/** error ของ SlipOK ที่แปลว่า "สลิปนี้ใช้ไม่ได้" — นอกนั้นถือว่าตรวจไม่ได้ชั่วคราว */
const REJECTED_CODES = new Set([1000, 1005, 1006, 1007, 1008, 1011, 1012, 1013, 1014]);

/** ข้อความภาษาไทยของเราเอง ใช้เมื่อ SlipOK ไม่ส่ง message มา (อ้างอิงตารางใน API docs v1.8) */
const CODE_MESSAGES: Record<number, string> = {
  1000: 'ไม่พบข้อมูล QR ของสลิป',
  1001: 'ตั้งค่า SlipOK ไม่ถูกต้อง (ไม่พบสาขา)',
  1002: 'ตั้งค่า SlipOK ไม่ถูกต้อง (API key)',
  1003: 'แพ็กเกจ SlipOK หมดอายุ',
  1004: 'โควตา SlipOK เต็ม',
  1005: 'ไฟล์ไม่ใช่รูปภาพ',
  1006: 'รูปสลิปไม่ถูกต้อง',
  1007: 'ไม่พบ QR บนสลิป',
  1008: 'QR นี้ไม่ใช่ QR ของสลิปโอนเงิน',
  1009: 'ข้อมูลธนาคารขัดข้องชั่วคราว',
  1010: 'ธนาคารนี้ต้องรอสักครู่หลังโอนก่อนตรวจได้',
  1011: 'QR หมดอายุ หรือไม่มีรายการโอนนี้จริง',
  1012: 'สลิปซ้ำ — สลิปนี้เคยใช้แล้ว',
  1013: 'ยอดในสลิปไม่ตรงกับยอดที่ต้องจ่าย',
  1014: 'ไม่ได้โอนเข้าบัญชีของร้าน',
};

const DEFAULT_BASE_URL = 'https://api.slipok.com/api/line/apikey';
const TIMEOUT_MS = 10_000;

/**
 * ตรวจสลิปโอนเงินผ่าน SlipOK — เชื่อแค่รหัสใน QR มุมขวาล่างของสลิป
 * ยอด เวลา และบัญชีผู้รับดึงจากข้อมูลธนาคาร รูปสลิปที่ถูกแก้จึงหลอกไม่ได้
 *
 * ตั้งค่า (.env): SLIPOK_API_KEY, SLIPOK_BRANCH_ID — ห้ามส่งไปหน้าบ้านเด็ดขาด
 * SLIPOK_MOCK=true = โหมดจำลอง ใช้ทดสอบก่อนมีบัญชี (ดู mockCheck)
 */
@Injectable()
export class SlipOkService {
  private readonly logger = new Logger(SlipOkService.name);
  private readonly apiKey: string | undefined;
  private readonly branchId: string | undefined;
  private readonly baseUrl: string;
  readonly mock: boolean;
  /** โหมดจำลอง: นับจำนวนครั้งที่ส่งสลิปแต่ละใบ (ใช้กับ MOCK-RETRY) */
  private readonly mockCalls = new Map<string, number>();

  constructor(config: ConfigService) {
    this.apiKey = config.get<string>('SLIPOK_API_KEY') || undefined;
    this.branchId = config.get<string>('SLIPOK_BRANCH_ID') || undefined;
    this.baseUrl = config.get<string>('SLIPOK_BASE_URL') || DEFAULT_BASE_URL;
    this.mock = config.get<string>('SLIPOK_MOCK') === 'true';

    if (this.mock) {
      this.logger.warn('SlipOK โหมดจำลอง (SLIPOK_MOCK=true) — ห้ามใช้กับร้านจริง');
    } else if (!this.configured) {
      this.logger.warn(
        'ยังไม่ได้ตั้ง SLIPOK_API_KEY / SLIPOK_BRANCH_ID — สลิป PromptPay จะเป็น "รอตรวจ" จนกว่าจะตั้งค่า',
      );
    }
  }

  get configured() {
    return Boolean(this.apiKey && this.branchId);
  }

  /** ตรวจสลิปจากข้อความใน QR พร้อมยอดที่ต้องจ่าย — ไม่ throw ทุกกรณีคืนเป็น SlipCheckResult */
  async check(payload: string, amount: number): Promise<SlipCheckResult> {
    if (this.mock) return this.mockCheck(payload, amount);
    if (!this.configured) {
      return { kind: 'unavailable', code: null, message: 'ยังไม่ได้ตั้งค่า SlipOK' };
    }

    let response: Response;
    try {
      response = await fetch(`${this.baseUrl}/${encodeURIComponent(this.branchId!)}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-authorization': this.apiKey!,
        },
        // log: true = ให้ SlipOK ตรวจบัญชีผู้รับกับบัญชีที่ผูกไว้ + จำสลิปไว้ตรวจซ้ำ (1012/1014)
        body: JSON.stringify({ data: payload, amount, log: true }),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch (e) {
      // timeout / DNS / เน็ตร้านหลุด — ไม่ใช่ความผิดของสลิป
      this.logger.warn(`เรียก SlipOK ไม่สำเร็จ: ${e instanceof Error ? e.message : e}`);
      return { kind: 'unavailable', code: null, message: 'ติดต่อ SlipOK ไม่ได้ (เน็ตหรือระบบขัดข้อง)' };
    }

    const body = (await response.json().catch(() => null)) as SlipOkResponse | null;
    return this.interpret(response.status, body);
  }

  private interpret(httpStatus: number, body: SlipOkResponse | null): SlipCheckResult {
    const data = body?.data;
    if (body?.success && data?.success && data.transRef) {
      return {
        kind: 'verified',
        transRef: data.transRef,
        amount: Number(data.amount),
        transAt: data.transTimestamp ? new Date(data.transTimestamp) : new Date(),
        sendingBank: data.sendingBank ?? null,
        receivingBank: data.receivingBank ?? null,
      };
    }

    const code = typeof body?.code === 'number' ? body.code : null;
    const message =
      body?.message || (code !== null ? CODE_MESSAGES[code] : undefined) || `SlipOK ตอบกลับผิดปกติ (HTTP ${httpStatus})`;

    if (code !== null && REJECTED_CODES.has(code)) {
      return { kind: 'rejected', code, message };
    }
    // QR อ่านได้แต่ไม่ใช่รายการที่ตรวจได้ (data.success = false) ก็ถือว่าสลิปใช้ไม่ได้
    if (body?.success && data && data.success === false) {
      return { kind: 'rejected', code, message: data.message || 'สลิปไม่ถูกต้อง' };
    }
    return { kind: 'unavailable', code, message };
  }

  /**
   * โหมดจำลอง — ข้อความ QR ขึ้นต้นด้วยคำเหล่านี้เพื่อจำลองผลแต่ละแบบ (ไว้ทดสอบหน้าจอ/เทสต์อัตโนมัติ)
   *   MOCK-DUP / MOCK-AMOUNT / MOCK-RECEIVER / MOCK-EXPIRED → rejected (1012/1013/1014/1011)
   *   MOCK-DOWN / MOCK-WAIT                                → unavailable (1009/1010) ทุกครั้ง
   *   MOCK-RETRY                                           → ครั้งแรก unavailable (1009) ครั้งต่อไป verified
   *   MOCK-OLD                                             → verified แต่เวลาโอนเมื่อวาน
   *   อื่น ๆ                                                → verified ยอดเท่ากับที่ขอ
   */
  private mockCheck(payload: string, amount: number): SlipCheckResult {
    const fail = (kind: 'rejected' | 'unavailable', code: number): SlipCheckResult => ({
      kind,
      code,
      message: `[จำลอง] ${CODE_MESSAGES[code]}`,
    });
    if (payload.startsWith('MOCK-DUP')) return fail('rejected', 1012);
    if (payload.startsWith('MOCK-AMOUNT')) return fail('rejected', 1013);
    if (payload.startsWith('MOCK-RECEIVER')) return fail('rejected', 1014);
    if (payload.startsWith('MOCK-EXPIRED')) return fail('rejected', 1011);
    if (payload.startsWith('MOCK-DOWN')) return fail('unavailable', 1009);
    if (payload.startsWith('MOCK-WAIT')) return fail('unavailable', 1010);
    if (payload.startsWith('MOCK-RETRY')) {
      const calls = (this.mockCalls.get(payload) ?? 0) + 1;
      this.mockCalls.set(payload, calls);
      if (calls === 1) return fail('unavailable', 1009);
    }

    const transAt = payload.startsWith('MOCK-OLD')
      ? new Date(Date.now() - 24 * 60 * 60 * 1000)
      : new Date();
    return {
      kind: 'verified',
      // สลิปเดียวกัน = รหัสเดียวกันเสมอ จะได้ทดสอบกันสลิปซ้ำฝั่งเราได้
      transRef: `MOCK${createHash('sha256').update(payload).digest('hex').slice(0, 16).toUpperCase()}`,
      amount,
      transAt,
      sendingBank: '004',
      receivingBank: '014',
    };
  }
}

/** รูปแบบ response ของ SlipOK (เฉพาะฟิลด์ที่ใช้) */
interface SlipOkResponse {
  success?: boolean;
  code?: number;
  message?: string;
  data?: {
    success?: boolean;
    message?: string;
    transRef?: string;
    transTimestamp?: string;
    amount?: number | string;
    sendingBank?: string;
    receivingBank?: string;
  };
}
