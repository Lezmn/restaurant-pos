#!/bin/sh
# สร้าง ~/app/.env ของ deploy/docker-compose.yml — สุ่มรหัส DB และ JWT_SECRET ใหม่ ไม่แสดงบนจอ
#   sh make-env.sh ghcr.io/<owner>/restaurant-pos pos.ร้าน.com api.ร้าน.com
# มี .env อยู่แล้วจะไม่ทับ (กันรหัส DB ไม่ตรงกับฐานข้อมูลเดิม) — แก้ค่าอื่นทีหลังด้วย nano .env
set -eu

image_prefix="${1:?ระบุ image prefix เช่น ghcr.io/owner/restaurant-pos}"
app_domain="${2:?ระบุโดเมนหน้าเว็บ เช่น pos.ร้าน.com}"
api_domain="${3:?ระบุโดเมน API เช่น api.ร้าน.com}"

if [ -e .env ]; then
  echo "มี .env อยู่แล้ว — ไม่ทับ (ลบเองถ้าต้องการสร้างใหม่ และต้องเป็นเครื่องที่ยังไม่มีข้อมูล)" >&2
  exit 1
fi

umask 077
# hex ไม่มีตัว / + = ที่ทำให้ DATABASE_URL เพี้ยน
cat > .env <<EOF
IMAGE_PREFIX=${image_prefix}
APP_DOMAIN=${app_domain}
API_DOMAIN=${api_domain}

POSTGRES_USER=restaurant
POSTGRES_PASSWORD=$(openssl rand -hex 24)
POSTGRES_DB=restaurant_db

JWT_SECRET=$(openssl rand -hex 48)
JWT_EXPIRES_IN=8h
TZ=Asia/Bangkok
THROTTLE_LIMIT=600
THROTTLE_IP_LIMIT=1000

# ตรวจสลิปอัตโนมัติ (ไม่ใส่ = สลิป "รอตรวจ" ADMIN ยืนยันเอง) — ใส่แล้ว: docker compose up -d api
SLIPOK_API_KEY=
SLIPOK_BRANCH_ID=

BACKUP_HOUR=03
BACKUP_KEEP_DAYS=14
BACKUP_PING_URL=
COMPOSE_PROFILES=
RCLONE_REMOTE=gdrive:restaurant-backups
OFFSITE_PING_URL=
EOF

echo "สร้าง .env แล้ว (image: ${image_prefix}, เว็บ: ${app_domain}, API: ${api_domain}) — ไม่ต้อง cat บนจอ (มีรหัสผ่าน)"
