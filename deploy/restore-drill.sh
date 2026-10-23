#!/bin/sh
# ซ้อมกู้ข้อมูล — กู้ไฟล์สำรองลงฐานข้อมูลชั่วคราว "restore_drill" แล้วนับข้อมูลเทียบกับของจริง จากนั้นลบทิ้ง
# ไม่แตะฐานข้อมูลจริง ไม่ต้องหยุด API — รันได้ระหว่างร้านเปิด (ทำเดือนละครั้ง)
#   sh deploy/restore-drill.sh                                   # ไฟล์ล่าสุดใน ./backups
#   sh deploy/restore-drill.sh backups/restaurant_db_2026-10-22_0300.dump
#   sh deploy/restore-drill.sh offsite/restaurant_db_....dump    # ไฟล์ที่ดึงกลับมาจากนอกเครื่อง
set -eu

file="${1:-$(ls -t backups/*.dump 2>/dev/null | head -n 1)}"
[ -n "$file" ] && [ -f "$file" ] || { echo "ไม่พบไฟล์สำรอง (ระบุเอง: sh deploy/restore-drill.sh <ไฟล์.dump>)" >&2; exit 1; }

# รันในโฟลเดอร์ราก repo (docker-compose.prod.yml) หรือ ~/app บน VPS (docker-compose.yml)
compose="docker compose"
[ -f docker-compose.prod.yml ] && compose="docker compose -f docker-compose.prod.yml"
psql_in() { $compose exec -T postgres sh -c "psql -v ON_ERROR_STOP=1 -qAt -U \"\$POSTGRES_USER\" -d $1"; }

counts="SELECT 'users', count(*)::text FROM users
UNION ALL SELECT 'tables', count(*)::text FROM restaurant_tables
UNION ALL SELECT 'menu_items', count(*)::text FROM menu_items
UNION ALL SELECT 'orders', count(*)::text FROM orders
UNION ALL SELECT 'payments', count(*)::text FROM payments
UNION ALL SELECT 'last_payment', coalesce(to_char(max(\"paidAt\") AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Bangkok', 'YYYY-MM-DD HH24:MI'), '-') FROM payments;"
# Prisma เก็บ DateTime เป็น UTC แบบไม่มี timezone — ต้องบอกว่าเป็น UTC ก่อนแปลงเป็นเวลาไทย

echo "ซ้อมกู้จาก $file ($(du -h "$file" | cut -f1))"
echo "DROP DATABASE IF EXISTS restore_drill; CREATE DATABASE restore_drill;" | psql_in postgres 2>&1 | grep -v 'does not exist, skipping' || true
# ลบ DB ชั่วคราวเสมอ แม้กู้ล้มกลางทาง
trap 'echo "DROP DATABASE IF EXISTS restore_drill;" | psql_in postgres' EXIT

$compose exec -T postgres sh -c 'pg_restore --no-owner --exit-on-error -U "$POSTGRES_USER" -d restore_drill' < "$file"

echo "ข้อมูลในไฟล์สำรอง | ข้อมูลจริงตอนนี้"
echo "$counts" | psql_in restore_drill > /tmp/drill_backup.$$
echo "$counts" | psql_in '"$POSTGRES_DB"' > /tmp/drill_live.$$
paste -d '|' /tmp/drill_backup.$$ /tmp/drill_live.$$ | awk -F'|' '{ printf "  %-13s %-26s | %s\n", $1, $2, $4 }'
rm -f /tmp/drill_backup.$$ /tmp/drill_live.$$
echo "กู้สำเร็จ — ตัวเลขในไฟล์สำรองควรน้อยกว่าหรือเท่ากับของจริง และ last_payment ไม่ควรเก่ากว่าเวลาสำรองล่าสุด"
