#!/bin/sh
# คัดลอกไฟล์สำรองออกนอกเครื่อง — รันใน container "offsite" (image rclone/rclone)
#   - ทุก OFFSITE_EVERY_MIN นาที คัดลอก ./backups/*.dump ไปที่ RCLONE_REMOTE (ไฟล์ที่มีแล้วข้าม ไม่อัปโหลดซ้ำ)
#   - ลบไฟล์ปลายทางที่เก่ากว่า OFFSITE_KEEP_DAYS วัน (นับจากเวลาไฟล์)
#   - ใช้ "copy" ไม่ใช้ "sync": ไฟล์ในเครื่องหาย/ถูกลบ ปลายทางยังอยู่ — ไม่ลามไปลบสำเนานอกเครื่อง
#   - สำเร็จ/ล้ม → ping OFFSITE_PING_URL (healthchecks.io) ถ้าไม่ ping ตามเวลา จะมีอีเมลเตือน
# ตั้งค่า remote ครั้งแรก (Google Drive ฯลฯ) ดู docs/OPERATIONS.md หัวข้อ "สำรองนอกเครื่อง"
set -u

EVERY_MIN="${OFFSITE_EVERY_MIN:-60}"
KEEP_DAYS="${OFFSITE_KEEP_DAYS:-90}"
REMOTE="${RCLONE_REMOTE:?ตั้ง RCLONE_REMOTE ใน .env เช่น gdrive:restaurant-backups}"

ping() {
  [ -n "${OFFSITE_PING_URL:-}" ] || return 0
  wget -q -T 10 -O /dev/null "$OFFSITE_PING_URL$1" || echo "[offsite] ping $OFFSITE_PING_URL$1 ไม่สำเร็จ" >&2
}

sync_once() {
  if rclone copy /backups "$REMOTE" --include "*.dump" --no-traverse \
    && rclone delete "$REMOTE" --include "*.dump" --min-age "${KEEP_DAYS}d"; then
    count=$(rclone lsf "$REMOTE" --include "*.dump" | wc -l)
    echo "[offsite] $(date '+%F %T') ok — ปลายทางมี $count ไฟล์"
    # ให้หน้า "สถานะระบบ" รู้ว่าส่งออกนอกเครื่องล่าสุดเมื่อไร (ไม่มีโฟลเดอร์ = compose เก่า ข้ามได้)
    [ -d /backup-status ] && date -u '+%Y-%m-%dT%H:%M:%SZ' > /backup-status/offsite-last-ok
    ping ""
  else
    echo "[offsite] $(date '+%F %T') FAILED" >&2
    ping "/fail"
  fi
}

sync_once
[ "${1:-}" = "once" ] && exit 0

while true; do
  sleep $((EVERY_MIN * 60))
  sync_once
done
