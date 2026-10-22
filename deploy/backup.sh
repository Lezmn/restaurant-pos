#!/bin/sh
# สำรองฐานข้อมูลอัตโนมัติ — รันใน container "backup" (image postgres:16-alpine มี pg_dump อยู่แล้ว)
#   - สำรอง 1 ครั้งตอน container เริ่ม (เช็คได้ทันทีว่าใช้งานได้) แล้วทุกวันตอน BACKUP_HOUR นาฬิกา (เวลาไทย)
#   - "once" = สำรองครั้งเดียวแล้วจบ (ก่อนอัปเดตระบบ)
#   - เก็บย้อนหลัง BACKUP_KEEP_DAYS วัน ไฟล์เก่ากว่านั้นลบทิ้ง
#   - ไฟล์อยู่ที่ ./backups บนเครื่อง host — ต้องคัดลอกออกไปเก็บนอกเครื่องอีกชั้น (ดู docs/OPERATIONS.md)
# ต่อ DB ด้วย PGHOST/PGUSER/PGPASSWORD/PGDATABASE จาก docker-compose.prod.yml
set -eu

BACKUP_DIR=/backups
HOUR="${BACKUP_HOUR:-03}"
KEEP_DAYS="${BACKUP_KEEP_DAYS:-14}"

backup() {
  stamp=$(date +%Y-%m-%d_%H%M)
  file="$BACKUP_DIR/${PGDATABASE}_${stamp}.dump"
  # เขียนลงไฟล์ชั่วคราวก่อน แล้วค่อยเปลี่ยนชื่อ — dump ล้มกลางทางจะไม่เหลือไฟล์ครึ่ง ๆ ให้เข้าใจผิดว่าใช้ได้
  if pg_dump --format=custom --no-owner --file="$file.tmp"; then
    mv "$file.tmp" "$file"
    echo "[backup] $(date '+%F %T') ok $(du -h "$file" | cut -f1) $file"
  else
    rm -f "$file.tmp"
    echo "[backup] $(date '+%F %T') FAILED" >&2
  fi
  find "$BACKUP_DIR" -name "${PGDATABASE}_*.dump" -mtime +"$KEEP_DAYS" -delete
}

mkdir -p "$BACKUP_DIR"
backup

# สำรองครั้งเดียวแล้วจบ — ใช้ก่อนอัปเดตระบบ: docker compose -f docker-compose.prod.yml run --rm backup once
[ "${1:-}" = "once" ] && exit 0

last_day=$(date +%F)

while true; do
  sleep 300
  today=$(date +%F)
  if [ "$(date +%H)" = "$HOUR" ] && [ "$today" != "$last_day" ]; then
    backup
    last_day=$today
  fi
done
