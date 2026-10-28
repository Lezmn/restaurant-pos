import { Prisma } from '@prisma/client';
import { formatCashCloseSummary } from '../../../src/line/cash-close-summary';
import { LineMessagingService } from '../../../src/line/line-messaging.service';

const config = (env: Record<string, string>) => ({ get: (k: string) => env[k] }) as any;

describe('formatCashCloseSummary', () => {
  const base = {
    date: '2026-10-26',
    cashSales: new Prisma.Decimal(1200),
    promptpaySales: new Prisma.Decimal(800.5),
    drawerExpenses: new Prisma.Decimal(100),
    openingFloat: new Prisma.Decimal(500),
    expectedCash: new Prisma.Decimal(1600),
    countedCash: new Prisma.Decimal(1580),
    difference: new Prisma.Decimal(-20),
    paymentCount: 14,
    closedByName: 'แคชเชียร์',
  };

  it('ยอดรวม วันที่ พ.ศ. และบอกเงินขาด', () => {
    const text = formatCashCloseSummary({ ...base, restaurantName: 'ร้านตามใจ' });
    expect(text).toContain('สรุปยอดปิดร้าน ร้านตามใจ');
    expect(text).toContain('26/10/2569');
    expect(text).toContain('ยอดขายรวม ฿2,000.50 (14 บิล)');
    expect(text).toContain('เงินขาด ฿20.00');
  });

  it('เงินตรง / เงินเกิน', () => {
    expect(formatCashCloseSummary({ ...base, difference: new Prisma.Decimal(0) })).toContain('เงินตรงพอดี');
    expect(formatCashCloseSummary({ ...base, difference: new Prisma.Decimal(35) })).toContain('เงินเกิน ฿35.00');
  });
});

const settingsStub = (cfg: Partial<{ token: string; to: string; enabled: boolean }>) =>
  ({ get: async () => ({ token: '', to: '', enabled: true, source: 'database', tokenUnreadable: false, ...cfg }) }) as any;

describe('LineMessagingService', () => {
  const realFetch = global.fetch;
  afterEach(() => {
    global.fetch = realFetch;
  });

  it('ยังไม่ตั้ง token / ปิดไว้ → ไม่ส่ง ไม่เรียก LINE', async () => {
    global.fetch = jest.fn() as any;
    await expect(new LineMessagingService(config({}), settingsStub({})).push('hi')).resolves.toBe(false);
    await expect(
      new LineMessagingService(config({}), settingsStub({ token: 'tok', to: 'U1', enabled: false })).push('hi'),
    ).resolves.toBe(false);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('ตั้งครบ → push ไปหาปลายทางด้วย Bearer token', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: true }) as any;
    const line = new LineMessagingService(config({}), settingsStub({ token: 'tok', to: 'U123' }));
    await expect(line.push('สรุปยอด')).resolves.toBe(true);
    const [url, init] = (global.fetch as jest.Mock).mock.calls[0];
    expect(url).toBe('https://api.line.me/v2/bot/message/push');
    expect(init.headers.Authorization).toBe('Bearer tok');
    expect(JSON.parse(init.body)).toEqual({ to: 'U123', messages: [{ type: 'text', text: 'สรุปยอด' }] });
  });

  it('LINE ตอบ error / ต่อไม่ได้ → push คืน false ไม่ throw และ send บอกสาเหตุเป็นภาษาคน', async () => {
    const line = new LineMessagingService(config({}), settingsStub({ token: 'tok', to: 'U123' }));
    global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 401, text: async () => 'bad token' }) as any;
    await expect(line.push('x')).resolves.toBe(false);
    const r = await line.send('tok', 'U123', 'x');
    expect(r.ok).toBe(false);
    expect(!r.ok && r.message).toMatch(/token ไม่ถูกต้อง/);
    global.fetch = jest.fn().mockRejectedValue(new Error('network down')) as any;
    await expect(line.push('x')).resolves.toBe(false);
  });
});

describe('LineMessagingService — รายละเอียดเพิ่มเติม', () => {
  const realFetch = global.fetch;
  afterEach(() => {
    global.fetch = realFetch;
  });

  it('shopName อ่านจาก RESTAURANT_NAME ตัดช่องว่าง / ไม่ตั้ง = ว่าง', () => {
    expect(new LineMessagingService(config({ RESTAURANT_NAME: '  ร้านป้าแดง ' }), settingsStub({})).shopName).toBe(
      'ร้านป้าแดง',
    );
    expect(new LineMessagingService(config({}), settingsStub({})).shopName).toBe('');
  });

  it('อ่านค่าตั้งค่าไม่ได้ → push คืน false ไม่ throw', async () => {
    global.fetch = jest.fn() as any;
    const broken: any = { get: jest.fn().mockRejectedValue(new Error('decrypt')) };
    await expect(new LineMessagingService(config({}), broken).push('x')).resolves.toBe(false);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('ข้อความยาวเกิน 5,000 ตัวถูกตัด', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: true }) as any;
    await new LineMessagingService(config({}), settingsStub({})).send('t', 'U', 'ก'.repeat(6000));
    const body = JSON.parse((global.fetch as jest.Mock).mock.calls[0][1].body);
    expect(body.messages[0].text).toHaveLength(5000);
  });

  it.each([
    [429, '', /โควตา/],
    [400, 'Invalid to', /User ID/],
    [400, 'bad request', /ไม่ยอมส่ง/],
    [403, '', /ไม่ยอมส่ง/],
    [500, '', /ผิดปกติ \(500\)/],
  ])('LINE ตอบ %s → อธิบายสาเหตุ', async (status, text, msg) => {
    global.fetch = jest.fn().mockResolvedValue({ ok: false, status, text: async () => text }) as any;
    const r = await new LineMessagingService(config({}), settingsStub({})).send('t', 'U', 'x');
    expect(r).toMatchObject({ ok: false, status });
    expect(!r.ok && r.message).toMatch(msg);
  });
});
