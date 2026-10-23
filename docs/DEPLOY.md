# Deploy ขึ้นเครื่องจริง

ทั้งระบบรันด้วย Docker Compose ไฟล์เดียว (`docker-compose.prod.yml`) บนเครื่อง Linux เครื่องเดียว
(VPS หรือคอมในร้านที่เปิดพอร์ต 80/443 ออกเน็ตได้)

```
อินเทอร์เน็ต ──► Caddy (web)  ──► หน้าเว็บ  https://APP_DOMAIN
                     │
                     └────────► api:3000   https://API_DOMAIN  (REST + WebSocket)
                                   │
                    postgres ◄─────┘   ◄── backup (pg_dump ทุกวัน → ./backups) ──► offsite (rclone → cloud)
```

| service | หน้าที่ |
|---|---|
| `postgres` | ฐานข้อมูล ไม่เปิดพอร์ตออกนอกเครื่อง |
| `migrate` | รัน `prisma migrate deploy` ก่อน API ทุกครั้งที่ deploy แล้วจบ |
| `api` | NestJS ที่ build แล้ว (ไม่มี devDependencies) มี HEALTHCHECK ที่ `/health` |
| `web` | Caddy: HTTPS อัตโนมัติจาก Let's Encrypt + เสิร์ฟหน้าเว็บ + reverse proxy ไป API |
| `backup` | `pg_dump` ทุกวันตอน `BACKUP_HOUR` เก็บ `BACKUP_KEEP_DAYS` วัน (ping healthchecks.io ถ้าตั้ง `BACKUP_PING_URL`) |
| `offsite` | คัดลอก `./backups` ขึ้น cloud ทุกชั่วโมงด้วย rclone — เปิดด้วย `COMPOSE_PROFILES=offsite` หลังตั้ง remote |

## สิ่งที่ต้องมีก่อน

- เครื่อง Linux ที่ติดตั้ง Docker Engine + Docker Compose v2 (RAM 2 GB ขึ้นไป)
- โดเมน 2 ชื่อ ชี้ (DNS A record) มาที่ IP ของเครื่องนี้ เช่น `pos.ร้าน.com` (หน้าเว็บ) และ `api.ร้าน.com` (API)
- เปิดพอร์ต 80 และ 443 ที่ firewall/router (80 ใช้ตอนขอใบรับรอง HTTPS)

## ขั้นตอน

```bash
git clone <repo> restaurant-pos && cd restaurant-pos
cp .env.prod.example .env
nano .env   # แก้ทุกค่าที่มี <...> — สุ่ม POSTGRES_PASSWORD และ JWT_SECRET ใหม่เสมอ
```

```bash
docker compose -f docker-compose.prod.yml up -d --build
docker compose -f docker-compose.prod.yml ps       # api ต้องขึ้น (healthy)
curl https://api.ร้าน.com/health                    # {"status":"ok","db":"ok",...}
```

### สร้าง ADMIN คนแรก + โต๊ะ (ครั้งเดียว)

```bash
docker compose -f docker-compose.prod.yml run --rm \
  -e ADMIN_EMAIL=owner@restaurant.local \
  -e ADMIN_PASSWORD='<รหัสชั่วคราว>' \
  -e ADMIN_NAME='เจ้าของร้าน' \
  -e TABLE_COUNT=8 \
  migrate npm run prisma:seed:prod
```

- ADMIN คนแรก **ต้องตั้งรหัสใหม่ตอน login ครั้งแรก** (รหัสชั่วคราวใช้ได้ครั้งเดียว)
  ถ้าเจ้าของร้านพิมพ์รหัสเองตอนติดตั้ง เพิ่ม `-e ADMIN_MUST_CHANGE_PASSWORD=false`
- ชื่อผู้ใช้ตอน login คือส่วนหน้า `@` (เช่น `owner`) ถ้าโดเมนตรงกับ `VITE_LOGIN_EMAIL_DOMAIN`
- **ห้ามใช้ `prisma:seed`** (ข้อมูล demo รหัส `ChangeMe123!` ทุกบัญชี)
- รันซ้ำได้ ถ้ามีผู้ใช้อยู่แล้วจะข้าม ไม่ทับรหัสเดิม

จากนั้นเจ้าของร้าน login → หน้า **บัญชีผู้ใช้** → เพิ่มบัญชีกลาง เช่น `kitchen` (ครัว) และ `cashier` (หน้าร้าน)

### หลัง deploy

1. ตั้ง UptimeRobot เฝ้า `https://API_DOMAIN/health` + หน้าเว็บ และ healthchecks.io เฝ้าการสำรอง (ดู [OPERATIONS.md](OPERATIONS.md#การเฝ้าระวังระบบ))
2. ตั้ง rclone remote แล้วเปิด service `offsite` (ดู [OPERATIONS.md](OPERATIONS.md#สำรองนอกเครื่อง-service-offsite))
   แล้ว **ซ้อมกู้ครั้งแรกทันที**: `sh deploy/restore-drill.sh`
3. ใส่ `SLIPOK_API_KEY` / `SLIPOK_BRANCH_ID` ถ้าใช้ตรวจสลิปอัตโนมัติ (ไม่ใส่ = สลิปค้าง "รอตรวจ" ADMIN ยืนยันเอง)

## อัปเดตเวอร์ชัน

```bash
docker compose -f docker-compose.prod.yml run --rm backup once   # สำรองก่อนเสมอ
git pull
docker compose -f docker-compose.prod.yml up -d --build          # migrate รันให้เองก่อน API
```

ค่า `VITE_*` ฝังลงหน้าเว็บตอน build — เปลี่ยนโดเมน/เบอร์พร้อมเพย์/ชื่อร้าน ต้อง `up -d --build` ใหม่

## ทดสอบบนเครื่องตัวเองก่อนขึ้นจริง

ใช้โดเมน `*.localhost` ได้ (Caddy ออกใบรับรองภายในให้ browser จะเตือนว่าไม่รู้จักผู้ออก):
`APP_DOMAIN=pos.localhost`, `API_DOMAIN=api.localhost`, `HTTP_PORT=8080`, `HTTPS_PORT=8443`
แล้วเปิด `https://pos.localhost:8443`
