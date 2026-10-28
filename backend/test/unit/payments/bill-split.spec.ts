import { Prisma } from '@prisma/client';
import { splitShare } from '../../../src/payments/bill-split';

const D = (v: number | string) => new Prisma.Decimal(v);

/** จ่ายทีละคนจนครบ แล้วคืนยอดของแต่ละคน */
function payAll(total: string, parts: number) {
  const shares: string[] = [];
  let paid = D(0);
  for (let i = 0; i < parts; i++) {
    const share = splitShare(D(total), parts, i, paid);
    shares.push(share.toFixed(2));
    paid = paid.plus(share);
  }
  return { shares, paid: paid.toFixed(2) };
}

describe('splitShare (หารเท่ากัน)', () => {
  it('หารลงตัว: ทุกคนจ่ายเท่ากัน', () => {
    expect(payAll('300', 3)).toEqual({ shares: ['100.00', '100.00', '100.00'], paid: '300.00' });
  });

  it('หารไม่ลงตัว: ปัดลงเป็นสตางค์ คนสุดท้ายจ่ายเศษ รวมแล้วเท่ายอดบิลพอดี', () => {
    expect(payAll('100', 3)).toEqual({ shares: ['33.33', '33.33', '33.34'], paid: '100.00' });
    expect(payAll('211.95', 4)).toEqual({ shares: ['52.98', '52.98', '52.98', '53.01'], paid: '211.95' });
  });

  it('ยอดน้อยมากก็ไม่ติดลบ', () => {
    const { shares, paid } = payAll('0.05', 3);
    expect(shares).toEqual(['0.01', '0.01', '0.03']);
    expect(paid).toBe('0.05');
  });

  it('มีคนจ่ายแล้วถูกยกเลิก (จ่ายแล้วน้อยกว่าที่ควร) คนสุดท้ายจ่ายส่วนที่เหลือจริง', () => {
    // หาร 3 จาก 90: จ่ายไปแล้ว 1 คน (30) — เหลือ 2 คน คนถัดไป 30 คนสุดท้าย 30
    expect(splitShare(D(90), 3, 1, D(30)).toFixed(2)).toBe('30.00');
    expect(splitShare(D(90), 3, 2, D(60)).toFixed(2)).toBe('30.00');
  });
});
