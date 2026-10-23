#!/bin/sh
# กู้ฐานข้อมูลจากไฟล์สำรอง — รันบนเครื่อง host ที่โฟลเดอร์ราก repo
#   sh deploy/restore.sh backups/restaurant_db_2026-10-22_0300.dump
# ⚠️ ทับข้อมูลปัจจุบันทั้งหมด — หยุด api ก่อน (กันออเดอร์ใหม่เข้ามาระหว่างกู้) แล้วค่อยเปิดคืน
set -eu

file="${1:?ระบุไฟล์ .dump เช่น backups/restaurant_db_2026-10-22_0300.dump}"
[ -f "$file" ] || { echo "ไม่พบไฟล์ $file" >&2; exit 1; }

compose="docker compose -f docker-compose.prod.yml"
printf 'จะทับข้อมูลปัจจุบันด้วย %s — พิมพ์ yes เพื่อยืนยัน: ' "$file"
read -r answer
[ "$answer" = "yes" ] || { echo "ยกเลิก"; exit 1; }

$compose stop api
# --clean ลบตารางเดิมก่อนสร้างใหม่จากไฟล์ / --if-exists กัน error ตอนตารางยังไม่มี
$compose exec -T postgres sh -c 'pg_restore --clean --if-exists --no-owner -U "$POSTGRES_USER" -d "$POSTGRES_DB"' < "$file"
$compose start api
echo "กู้ข้อมูลจาก $file เสร็จแล้ว — เปิด https://\$APP_DOMAIN แล้วตรวจยอดล่าสุดอีกครั้ง"
