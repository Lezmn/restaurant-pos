/** "3 ชั่วโมงที่แล้ว" — เจ้าของร้านอยากรู้ว่านานแค่ไหน มากกว่าเวลาเป๊ะ ๆ */
export const ago = (iso: string, now = Date.now()) => {
  const minutes = Math.max(0, Math.round((now - new Date(iso).getTime()) / 60_000))
  if (minutes < 1) return 'เมื่อสักครู่'
  if (minutes < 60) return `${minutes} นาทีที่แล้ว`
  const hours = Math.round(minutes / 60)
  if (hours < 48) return `${hours} ชั่วโมงที่แล้ว`
  return `${Math.round(hours / 24)} วันที่แล้ว`
}
