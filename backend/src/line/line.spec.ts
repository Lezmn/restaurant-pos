import { Prisma } from '@prisma/client';
import { formatCashCloseSummary } from './cash-close-summary';
import { LineMessagingService } from './line-messaging.service';

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

describe('LineMessagingService', () => {
  const realFetch = global.fetch;
  afterEach(() => {
    global.fetch = realFetch;
  });

  it('ไม่ตั้ง token → ไม่ส่ง ไม่เรียก LINE', async () => {
    global.fetch = jest.fn() as any;
    const line = new LineMessagingService(config({}));
    await expect(line.push('hi')).resolves.toBe(false);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('ตั้งครบ → push ไปหา LINE_TO ด้วย Bearer token', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: true }) as any;
    const line = new LineMessagingService(config({ LINE_CHANNEL_ACCESS_TOKEN: 'tok', LINE_TO: 'U123' }));
    await expect(line.push('สรุปยอด')).resolves.toBe(true);
    const [url, init] = (global.fetch as jest.Mock).mock.calls[0];
    expect(url).toBe('https://api.line.me/v2/bot/message/push');
    expect(init.headers.Authorization).toBe('Bearer tok');
    expect(JSON.parse(init.body)).toEqual({ to: 'U123', messages: [{ type: 'text', text: 'สรุปยอด' }] });
  });

  it('LINE ตอบ error / ต่อไม่ได้ → คืน false ไม่ throw', async () => {
    const line = new LineMessagingService(config({ LINE_CHANNEL_ACCESS_TOKEN: 'tok', LINE_TO: 'U123' }));
    global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 401, text: async () => 'bad token' }) as any;
    await expect(line.push('x')).resolves.toBe(false);
    global.fetch = jest.fn().mockRejectedValue(new Error('network down')) as any;
    await expect(line.push('x')).resolves.toBe(false);
  });
});
