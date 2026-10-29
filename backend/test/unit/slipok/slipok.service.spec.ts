import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SlipOkService } from '../../../src/slipok/slipok.service';

const config = (values: Record<string, string>) =>
  ({ get: (k: string) => values[k] }) as unknown as ConfigService;

const real = () => new SlipOkService(config({ SLIPOK_API_KEY: 'key-1', SLIPOK_BRANCH_ID: 'br-1' }));
const mock = () => new SlipOkService(config({ SLIPOK_MOCK: 'true' }));

/** ให้ fetch ตอบ status + body ตามที่กำหนด (body = null → ไม่ใช่ JSON) */
function respond(status: number, body: unknown) {
  return jest.spyOn(global, 'fetch').mockResolvedValue({
    status,
    json: () => (body === null ? Promise.reject(new SyntaxError('not json')) : Promise.resolve(body)),
  } as Response);
}

beforeEach(() => {
  jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('SlipOkService — ต่อ SlipOK จริง', () => {
  // ทดสอบ: ยังไม่ได้ตั้ง API key หรือสาขาของ SlipOK ต้องตอบว่าตรวจไม่ได้ชั่วคราว และไม่เรียก SlipOK
  // วิธี: สร้าง service โดยไม่มี config → check() → เช็กผล unavailable "ยังไม่ได้ตั้งค่า SlipOK" และ fetch ไม่ถูกเรียก
  it('ยังไม่ได้ตั้ง API key / สาขา → ตรวจไม่ได้ชั่วคราว ไม่เรียก SlipOK', async () => {
    const fetch = jest.spyOn(global, 'fetch');
    const result = await new SlipOkService(config({})).check('qr', 100);
    expect(result).toEqual({ kind: 'unavailable', code: null, message: 'ยังไม่ได้ตั้งค่า SlipOK' });
    expect(fetch).not.toHaveBeenCalled();
  });

  // ทดสอบ: คำขอที่ส่งไป SlipOK ถูกต้อง: URL ของสาขาร้าน, API key ใน header และ body มีข้อความ QR ยอด และ log: true
  // วิธี: ดัก fetch ให้ตอบผ่าน → check() → อ่าน URL, header และ body ของคำขอที่ส่งไป
  it('ส่งข้อความ QR + ยอด + log ไปที่สาขาของร้าน พร้อม API key ใน header', async () => {
    const fetch = respond(200, { success: true, data: { success: true, transRef: 'T1', amount: 100 } });
    await real().check('qr-text', 100);
    const [url, init] = fetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.slipok.com/api/line/apikey/br-1');
    expect((init.headers as Record<string, string>)['x-authorization']).toBe('key-1');
    expect(JSON.parse(init.body as string)).toEqual({ data: 'qr-text', amount: 100, log: true });
  });

  // ทดสอบ: SlipOK ตอบว่าผ่าน ต้องได้ verified พร้อมรหัสรายการ ยอด (แปลงจากข้อความเป็นตัวเลข) เวลาโอน และธนาคาร
  // วิธี: ดัก fetch ให้ตอบ success พร้อม amount เป็นข้อความ "150.50" → check() → เช็กผลทั้งก้อน
  it('ตรวจผ่าน → verified พร้อมรหัสรายการ ยอด (แปลงจากข้อความ) เวลาโอน และธนาคาร', async () => {
    respond(200, {
      success: true,
      data: {
        success: true,
        transRef: 'T1',
        amount: '150.50',
        transTimestamp: '2026-10-28T04:00:00.000Z',
        sendingBank: '004',
        receivingBank: '014',
      },
    });
    expect(await real().check('qr', 150.5)).toEqual({
      kind: 'verified',
      transRef: 'T1',
      amount: 150.5,
      transAt: new Date('2026-10-28T04:00:00.000Z'),
      sendingBank: '004',
      receivingBank: '014',
    });
  });

  // ทดสอบ: รหัส error ที่แปลว่าสลิปใช้ไม่ได้ (1000, 1011-1014) ต้องได้ rejected และใช้ข้อความไทยของเราเมื่อ SlipOK ไม่ส่งข้อความมา
  // วิธี: ดัก fetch ให้ตอบ 400 พร้อมแค่รหัส (ทีละรหัส) → check() → เช็ก kind, code และข้อความ
  it.each([
    [1000, 'ไม่พบข้อมูล QR ของสลิป'],
    [1011, 'QR หมดอายุ หรือไม่มีรายการโอนนี้จริง'],
    [1012, 'สลิปซ้ำ — สลิปนี้เคยใช้แล้ว'],
    [1013, 'ยอดในสลิปไม่ตรงกับยอดที่ต้องจ่าย'],
    [1014, 'ไม่ได้โอนเข้าบัญชีของร้าน'],
  ])('รหัส %i = สลิปใช้ไม่ได้ → rejected (ไม่มีข้อความมา ใช้ข้อความไทยของเรา)', async (code, message) => {
    respond(400, { success: false, code });
    expect(await real().check('qr', 100)).toEqual({ kind: 'rejected', code, message });
  });

  // ทดสอบ: รหัส error ที่เป็นปัญหาฝั่งระบบ ไม่ใช่สลิป (ตั้งค่าผิด/แพ็กเกจหมด/โควตาเต็ม/ธนาคารขัดข้อง/ให้รอ) ต้องได้ unavailable เพื่อบันทึกรอตรวจซ้ำ
  // วิธี: ดัก fetch ให้ตอบ 400 พร้อมแค่รหัส (ทีละรหัส) → check() → เช็ก kind, code และข้อความ
  it.each([
    [1001, 'ตั้งค่า SlipOK ไม่ถูกต้อง (ไม่พบสาขา)'],
    [1003, 'แพ็กเกจ SlipOK หมดอายุ'],
    [1004, 'โควตา SlipOK เต็ม'],
    [1009, 'ข้อมูลธนาคารขัดข้องชั่วคราว'],
    [1010, 'ธนาคารนี้ต้องรอสักครู่หลังโอนก่อนตรวจได้'],
  ])('รหัส %i = ปัญหาฝั่งระบบ ไม่ใช่สลิป → unavailable (บันทึกรอตรวจซ้ำ)', async (code, message) => {
    respond(400, { success: false, code });
    expect(await real().check('qr', 100)).toEqual({ kind: 'unavailable', code, message });
  });

  // ทดสอบ: ถ้า SlipOK ส่งข้อความ error มาเอง ต้องใช้ข้อความนั้นแทนข้อความของเรา
  // วิธี: ดัก fetch ให้ตอบรหัส 1012 พร้อม message → check() → เช็กว่าได้ message ของ SlipOK
  it('SlipOK ส่งข้อความมาเอง → ใช้ข้อความนั้นแทนของเรา', async () => {
    respond(400, { success: false, code: 1012, message: 'Duplicate slip' });
    expect(await real().check('qr', 100)).toEqual({ kind: 'rejected', code: 1012, message: 'Duplicate slip' });
  });

  // ทดสอบ: ข้อความสลิปซ้ำของ SlipOK มีวันที่แบบ Date.toString() ต้องแปลงเป็นวันที่แบบไทย
  // วิธี: ดัก fetch ให้ตอบ 1012 พร้อมข้อความจริงที่มี "GMT+0700 (Indochina Time)" → check() → เช็กว่าได้ "29 ต.ค. 2569 15:59 น."
  it('วันที่ในข้อความ SlipOK แปลงเป็นวันที่แบบไทย', async () => {
    respond(400, {
      success: false,
      code: 1012,
      message: 'สลิปซ้ำ สลิปนี้เคยส่งเข้ามาในระบบเมื่อ Thu Oct 29 2026 15:59:35 GMT+0700 (Indochina Time)',
    });
    expect(await real().check('qr', 100)).toEqual({
      kind: 'rejected',
      code: 1012,
      message: 'สลิปซ้ำ สลิปนี้เคยส่งเข้ามาในระบบเมื่อ 29 ต.ค. 2569 15:59 น.',
    });
  });

  // ทดสอบ: SlipOK อ่าน QR ได้แต่ไม่ใช่รายการโอน (data.success = false) ต้องได้ rejected
  // วิธี: ดัก fetch ให้ตอบ success: true แต่ data.success: false → check() → เช็กผล rejected พร้อมข้อความใน data
  it('อ่าน QR ได้แต่ไม่ใช่รายการที่ตรวจได้ (data.success = false) → rejected', async () => {
    respond(200, { success: true, data: { success: false, message: 'ไม่ใช่สลิป' } });
    expect(await real().check('qr', 100)).toEqual({ kind: 'rejected', code: null, message: 'ไม่ใช่สลิป' });
  });

  // ทดสอบ: SlipOK ตอบ 500 ที่ไม่ใช่ JSON ต้องได้ unavailable และบอก HTTP status
  // วิธี: ดัก fetch ให้ตอบ 500 ที่ parse JSON ไม่ได้ → check() → เช็กข้อความ "HTTP 500"
  it('ตอบ 500 ไม่ใช่ JSON → unavailable บอก HTTP status', async () => {
    respond(500, null);
    expect(await real().check('qr', 100)).toEqual({
      kind: 'unavailable',
      code: null,
      message: 'SlipOK ตอบกลับผิดปกติ (HTTP 500)',
    });
  });

  // ทดสอบ: รหัส error ที่ไม่รู้จัก ต้องได้ unavailable ไม่ตัดสินว่าสลิปเสีย
  // วิธี: ดัก fetch ให้ตอบรหัส 9999 → check() → เช็ก kind unavailable
  it('รหัสที่ไม่รู้จัก → unavailable (ไม่ตัดสินว่าสลิปเสีย)', async () => {
    respond(400, { success: false, code: 9999 });
    expect(await real().check('qr', 100)).toMatchObject({ kind: 'unavailable', code: 9999 });
  });

  // ทดสอบ: เน็ตหลุดหรือเรียก SlipOK หมดเวลา ต้องได้ unavailable และไม่ throw
  // วิธี: ดัก fetch ให้ reject ด้วย TimeoutError → check() → เช็กผล unavailable "ติดต่อ SlipOK ไม่ได้"
  it('เน็ตหลุด / หมดเวลา → unavailable ไม่ throw', async () => {
    jest.spyOn(global, 'fetch').mockRejectedValue(new DOMException('timed out', 'TimeoutError'));
    expect(await real().check('qr', 100)).toEqual({
      kind: 'unavailable',
      code: null,
      message: 'ติดต่อ SlipOK ไม่ได้ (เน็ตหรือระบบขัดข้อง)',
    });
  });
});

describe('SlipOkService — โหมดจำลอง (SLIPOK_MOCK=true)', () => {
  // ทดสอบ: โหมดจำลองไม่เรียก SlipOK จริง และสลิปทั่วไปผ่านด้วยยอดที่ขอ
  // วิธี: เปิด SLIPOK_MOCK → check() ด้วยข้อความธรรมดา → เช็ก verified ยอด 80 และ fetch ไม่ถูกเรียก
  it('ไม่เรียก SlipOK จริง และสลิปทั่วไปผ่านด้วยยอดที่ขอ', async () => {
    const fetch = jest.spyOn(global, 'fetch');
    expect(await mock().check('anything', 80)).toMatchObject({ kind: 'verified', amount: 80 });
    expect(fetch).not.toHaveBeenCalled();
  });

  // ทดสอบ: โหมดจำลอง: คำนำหน้าแต่ละแบบให้ผลตามที่กำหนด (สลิปซ้ำ/ยอดไม่ตรง/โอนผิดบัญชี/QR หมดอายุ/ระบบล่ม/ธนาคารให้รอ)
  // วิธี: เปิด SLIPOK_MOCK → check() ด้วยแต่ละคำนำหน้า → เช็ก kind และ code
  it.each([
    ['MOCK-DUP-1', 'rejected', 1012],
    ['MOCK-AMOUNT-1', 'rejected', 1013],
    ['MOCK-RECEIVER-1', 'rejected', 1014],
    ['MOCK-EXPIRED-1', 'rejected', 1011],
    ['MOCK-DOWN-1', 'unavailable', 1009],
    ['MOCK-WAIT-1', 'unavailable', 1010],
  ])('%s → %s (%i)', async (payload, kind, code) => {
    expect(await mock().check(payload, 100)).toMatchObject({ kind, code });
  });

  // ทดสอบ: โหมดจำลอง MOCK-RETRY: ครั้งแรกตรวจไม่ได้ ครั้งต่อไปผ่าน และนับแยกต่อสลิป
  // วิธี: check() สลิป a, สลิป b, แล้ว a อีกครั้ง → เช็กว่า a กับ b ครั้งแรกเป็น unavailable และ a ครั้งที่สองเป็น verified
  it('MOCK-RETRY: ครั้งแรกตรวจไม่ได้ ครั้งต่อไปผ่าน (นับแยกต่อสลิป)', async () => {
    const service = mock();
    expect(await service.check('MOCK-RETRY-a', 100)).toMatchObject({ kind: 'unavailable', code: 1009 });
    expect(await service.check('MOCK-RETRY-b', 100)).toMatchObject({ kind: 'unavailable', code: 1009 });
    expect(await service.check('MOCK-RETRY-a', 100)).toMatchObject({ kind: 'verified' });
  });

  // ทดสอบ: โหมดจำลอง: สลิปเดียวกันได้รหัสรายการเดิมทุกครั้ง สลิปต่างกันได้รหัสต่างกัน (ใช้ทดสอบกันสลิปซ้ำฝั่งเรา)
  // วิธี: check() สลิป a สองครั้งและสลิป b → เทียบ transRef
  it('สลิปเดียวกันได้รหัสรายการเดิมทุกครั้ง สลิปต่างกันได้รหัสต่างกัน', async () => {
    const service = mock();
    const a1 = await service.check('slip-a', 100);
    const a2 = await service.check('slip-a', 100);
    const b = await service.check('slip-b', 100);
    expect(a1.kind === 'verified' && a2.kind === 'verified' && b.kind === 'verified').toBe(true);
    if (a1.kind !== 'verified' || a2.kind !== 'verified' || b.kind !== 'verified') return;
    expect(a1.transRef).toBe(a2.transRef);
    expect(a1.transRef).not.toBe(b.transRef);
  });

  // ทดสอบ: โหมดจำลอง MOCK-OLD: ผ่าน แต่เวลาโอนเป็นเมื่อวาน (ใช้ทดสอบสลิปเก่าก่อนเปิดโต๊ะ)
  // วิธี: check() ด้วย MOCK-OLD → เช็ก verified และเวลาโอนห่างจากตอนนี้เกิน 23 ชม.
  it('MOCK-OLD: ผ่านแต่เวลาโอนเมื่อวาน', async () => {
    const result = await mock().check('MOCK-OLD-1', 100);
    expect(result.kind).toBe('verified');
    if (result.kind !== 'verified') return;
    expect(Date.now() - result.transAt.getTime()).toBeGreaterThan(23 * 60 * 60 * 1000);
  });
});
