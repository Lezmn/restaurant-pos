import { addDays, monthToRange, resolveDateRange, startOfDay } from './date-range.util';

/** ทุกเคสรันด้วย TZ=Asia/Bangkok (test/setup-tz.js) — เวลาร้าน = UTC+7 */
describe('date-range.util (เวลาไทย)', () => {
  it('ใช้ TZ Asia/Bangkok จริง', () => {
    expect(new Date('2026-01-01T00:00:00Z').getTimezoneOffset()).toBe(-420);
  });

  it('startOfDay: 00:30 เวลาไทย ยังเป็นวันเดียวกัน (ไม่ไหลไปเมื่อวานแบบ UTC)', () => {
    const justAfterMidnight = new Date('2026-10-20T17:30:00Z'); // 21 ต.ค. 00:30 ไทย
    expect(startOfDay(justAfterMidnight).toISOString()).toBe('2026-10-20T17:00:00.000Z');
  });

  it('startOfDay: 23:59 เวลาไทย', () => {
    const lateNight = new Date('2026-10-21T16:59:59Z'); // 21 ต.ค. 23:59:59 ไทย
    expect(startOfDay(lateNight).toISOString()).toBe('2026-10-20T17:00:00.000Z');
  });

  it('addDays ไม่แก้ค่าเดิม และข้ามเดือนได้', () => {
    const d = new Date(2026, 9, 31);
    const next = addDays(d, 1);
    expect(d.getDate()).toBe(31);
    expect([next.getMonth(), next.getDate()]).toEqual([10, 1]);
    expect(addDays(new Date(2026, 0, 1), -1).getFullYear()).toBe(2025);
  });

  it('monthToRange: [ต้นเดือน, ต้นเดือนถัดไป) ตามเวลาไทย', () => {
    const { start, end } = monthToRange('2026-02');
    expect(start.toISOString()).toBe('2026-01-31T17:00:00.000Z');
    expect(end.toISOString()).toBe('2026-02-28T17:00:00.000Z');
  });

  it('monthToRange: ธันวาคม → มกราคมปีหน้า', () => {
    const { start, end } = monthToRange('2026-12');
    expect(start.toISOString()).toBe('2026-11-30T17:00:00.000Z');
    expect(end.toISOString()).toBe('2026-12-31T17:00:00.000Z');
  });

  it('resolveDateRange: month มาก่อน from/to', () => {
    const r = resolveDateRange({ month: '2026-09', from: '2020-01-01', to: '2020-01-02' });
    expect(r).toEqual({ gte: new Date(2026, 8, 1), lt: new Date(2026, 9, 1) });
  });

  it('resolveDateRange: ไม่ส่งอะไร → undefined (ไม่กรอง)', () => {
    expect(resolveDateRange({})).toBeUndefined();
  });

  it('resolveDateRange: from อย่างเดียว / to อย่างเดียว', () => {
    expect(resolveDateRange({ from: '2026-09-01T00:00:00.000Z' })).toEqual({
      gte: new Date('2026-09-01T00:00:00.000Z'),
    });
    expect(resolveDateRange({ to: '2026-09-30T23:59:59.000Z' })).toEqual({
      lte: new Date('2026-09-30T23:59:59.000Z'),
    });
  });

  /**
   * from/to แบบวันล้วน "2026-09-30" ถูก new Date() ตีเป็นเที่ยงคืน UTC = 07:00 เวลาไทย
   * คาดหวัง: to=2026-09-30 ต้องครอบคลุมรายการตอน 20:00 ของวันที่ 30 (เวลาร้าน)
   */
  it('resolveDateRange: to แบบวันล้วนต้องครอบคลุมทั้งวันตามเวลาร้าน', () => {
    const r = resolveDateRange({ from: '2026-09-01', to: '2026-09-30' }) as { gte?: Date; lt?: Date; lte?: Date };
    const dinnerOn30th = new Date(2026, 8, 30, 20, 0); // 20:00 ไทย
    const earlyOn1st = new Date(2026, 8, 1, 6, 0); // 06:00 ไทย
    expect(dinnerOn30th <= (r.lte ?? r.lt)!).toBe(true);
    expect(earlyOn1st >= r.gte!).toBe(true);
  });
});
