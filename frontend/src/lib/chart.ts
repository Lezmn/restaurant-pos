/** ระยะห่างเส้นกริดที่เป็นเลขกลม ๆ (1 / 2 / 2.5 / 5 × 10ⁿ) ป้ายแกนจะได้ไม่เป็น 17.5, 35, 52.5 */
export const niceStep = (max: number, ticks = 4) => {
  if (max <= 0) return 25
  const raw = max / ticks
  const mag = 10 ** Math.floor(Math.log10(raw))
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw)
  return Math.max(1, step ?? raw)
}
