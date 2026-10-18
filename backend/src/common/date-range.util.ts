/**
 * ตัวช่วยเรื่องช่วงเวลา ใช้ร่วมกันระหว่าง expenses กับ reports
 * ทุกอย่างอิงเวลาเครื่อง server (ร้านอยู่ไทม์โซนเดียว) ไม่ต้องแปลง timezone
 */

/** ต้นวันของวันที่ที่ให้มา (00:00:00.000) */
export function startOfDay(date: Date = new Date()) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

/** บวก/ลบวัน โดยไม่แก้ค่าเดิม */
export function addDays(date: Date, days: number) {
  const copy = new Date(date);
  copy.setDate(copy.getDate() + days);
  return copy;
}

/** แปลง 'YYYY-MM' เป็นช่วง [start, end) ของเดือนนั้น */
export function monthToRange(month: string) {
  const [year, monthNumber] = month.split('-').map(Number);
  return {
    start: new Date(year, monthNumber - 1, 1),
    end: new Date(year, monthNumber, 1),
  };
}

/**
 * รวม filter ช่วงเวลาให้เป็นรูปแบบเดียว — month มาก่อน ถ้าไม่มีค่อยใช้ from/to
 * คืน undefined ถ้าไม่ได้ระบุอะไรเลย (แปลว่าไม่กรอง)
 */
export function resolveDateRange(params: {
  month?: string;
  from?: string;
  to?: string;
}) {
  if (params.month) {
    const { start, end } = monthToRange(params.month);
    return { gte: start, lt: end };
  }

  if (!params.from && !params.to) return undefined;

  return {
    ...(params.from ? { gte: new Date(params.from) } : {}),
    ...(params.to ? { lte: new Date(params.to) } : {}),
  };
}
