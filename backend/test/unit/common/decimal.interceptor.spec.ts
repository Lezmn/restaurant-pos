import { Prisma } from '@prisma/client';
import { lastValueFrom, of } from 'rxjs';
import { DecimalInterceptor, decimalToNumber } from '../../../src/common/interceptors/decimal.interceptor';

const D = (v: string) => new Prisma.Decimal(v);

describe('decimalToNumber', () => {
  it('แปลง Decimal ทุกชั้น (object ซ้อน + array) เป็น number', () => {
    expect(
      decimalToNumber({
        total: D('150.25'),
        items: [{ price: D('50'), options: [{ price: D('10.5') }] }],
        name: 'ผัดไทย',
        qty: 2,
        paid: true,
      }),
    ).toEqual({
      total: 150.25,
      items: [{ price: 50, options: [{ price: 10.5 }] }],
      name: 'ผัดไทย',
      qty: 2,
      paid: true,
    });
  });

  it('null/undefined/primitive ผ่านไปตามเดิม', () => {
    expect(decimalToNumber(null)).toBeNull();
    expect(decimalToNumber(undefined)).toBeUndefined();
    expect(decimalToNumber('x')).toBe('x');
    expect(decimalToNumber(0)).toBe(0);
  });

  it('Date / Buffer / class instance ไม่ถูกแตะ', () => {
    const date = new Date();
    const buf = Buffer.from('x');
    class Streamable {
      price = D('1');
    }
    const s = new Streamable();
    const out = decimalToNumber({ date, buf, s }) as any;
    expect(out.date).toBe(date);
    expect(out.buf).toBe(buf);
    expect(out.s).toBe(s);
  });

  it('object ที่ไม่มี prototype ก็แปลงได้', () => {
    const bare = Object.create(null);
    bare.amount = D('3');
    expect(decimalToNumber(bare)).toEqual({ amount: 3 });
  });
});

describe('DecimalInterceptor', () => {
  it('แปลง response ของทุก handler', async () => {
    const out = new DecimalInterceptor().intercept({} as any, { handle: () => of({ amount: D('9.99') }) });
    await expect(lastValueFrom(out)).resolves.toEqual({ amount: 9.99 });
  });
});
