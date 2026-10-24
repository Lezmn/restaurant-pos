# Deploy ขึ้นเครื่องจริง

มี 2 แบบ เลือกแบบเดียว:

| | **A. GHCR + Nginx + CI/CD (ใช้จริงอยู่ — แนะนำ)** | B. Caddy ในเครื่องเดียว |
|---|---|---|
| build image | GitHub Actions → ghcr.io (VPS แค่ pull) | build บนเครื่องที่ deploy |
| HTTPS | Nginx + certbot บนเครื่อง | Caddy ใน Docker |
| อัปเดต | push เข้า main → deploy เอง | `git pull` + `up --build` เอง |
| ไฟล์ | `deploy/docker-compose.yml`, `deploy/nginx.conf`, `.github/workflows/deploy.yml` | `docker-compose.prod.yml`, `deploy/Caddyfile` |

## A. GHCR + Nginx + CI/CD

```
push main → CI ผ่าน → Deploy: build 3 image → ghcr.io/<owner>/restaurant-pos-{api,migrator,web}
                              └─ SSH เป็น deploy → docker login (GITHUB_TOKEN ชั่วคราว) → pull → up -d → logout
อินเทอร์เน็ต ─► Nginx :443 (certbot) ─┬─ pos.โดเมน ─► 127.0.0.1:8080 web (ไฟล์ static)
                                      └─ api.โดเมน ─► 127.0.0.1:3000 api ─► postgres (+ backup ทุกวัน)
```

### 1. VPS (ทำครั้งเดียว — Ubuntu ที่มี Docker แล้ว)

ใน hPanel → VPS → Firewall: Accept TCP 22, 80, 443 แล้วกด **ซิงโครไนซ์** (ไม่กด = ยังบล็อกทุกพอร์ต)

```bash
# root
DEBIAN_FRONTEND=noninteractive apt-get update && DEBIAN_FRONTEND=noninteractive apt-get -o Dpkg::Options::=--force-confold upgrade -y
fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile && echo "/swapfile none swap sw 0 0" >> /etc/fstab
adduser --disabled-password --gecos "" deploy && usermod -aG docker deploy
install -d -m 700 -o deploy -g deploy /home/deploy/.ssh   # ใส่ public key ของคนดูแล + ของ GitHub Actions ใน authorized_keys
ufw allow OpenSSH && ufw allow 80/tcp && ufw allow 443/tcp && ufw --force enable
apt-get install -y nginx certbot python3-certbot-nginx
```

### 2. ไฟล์ของแอป (เป็น user deploy ที่ `~/app`)

คัดลอก `deploy/docker-compose.yml`, `make-env.sh`, `backup.sh`, `offsite.sh`, `restore.sh`, `restore-drill.sh`, `nginx.conf` ไปไว้ที่ `~/app` แล้ว

```bash
cd ~/app && sh make-env.sh ghcr.io/<owner-ตัวเล็ก>/restaurant-pos pos.ร้าน.com api.ร้าน.com
docker compose config --quiet && echo OK
```

### 3. Nginx + HTTPS (root — DNS A record ของ pos/api ต้องชี้มาที่ VPS แล้ว)

```bash
sed -e 's/pos\.example\.com/pos.ร้าน.com/g' -e 's/api\.example\.com/api.ร้าน.com/g' /home/deploy/app/nginx.conf > /etc/nginx/sites-available/restaurant
ln -s /etc/nginx/sites-available/restaurant /etc/nginx/sites-enabled/ && rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl reload nginx
certbot --nginx -d pos.ร้าน.com -d api.ร้าน.com --redirect -m <อีเมล> --agree-tos -n
```

### 4. GitHub → Settings → Secrets and variables → Actions

| ที่ | ชื่อ | ค่า |
|---|---|---|
| Secrets | `VPS_HOST` / `VPS_USER` / `VPS_SSH_KEY` | IP / `deploy` / private key ที่ใส่ไว้ใน authorized_keys ของ deploy |
| Variables | `VITE_API_URL` | `https://api.ร้าน.com` |
| Variables | `VITE_PROMPTPAY_ID`, `VITE_RESTAURANT_NAME` | เบอร์พร้อมเพย์ / ชื่อร้าน |
| Variables | `APP_URL` | `https://pos.ร้าน.com` — **ต้องอยู่แท็บ Variables** ไม่งั้น job deploy ถูกข้าม |

แล้ว Actions → **Deploy** → Run workflow (ครั้งต่อไป push เข้า main แล้ว deploy เอง) — ไม่ต้องสร้าง token ของ GHCR บน VPS

### 5. ADMIN คนแรก + โต๊ะ (ครั้งเดียว — deploy)

```bash
cd ~/app && docker compose run --rm -e ADMIN_EMAIL=<ชื่อ>@restaurant.local -e ADMIN_PASSWORD='<รหัสชั่วคราว>' -e TABLE_COUNT=10 migrate npm run prisma:seed:prod
```

รูปเมนูที่อัปโหลดเก็บที่ `~/app/uploads` (สร้างเป็นของ user deploy ก่อน deploy ครั้งแรก: `mkdir -p ~/app/uploads`
ถ้าไม่สร้าง Docker จะสร้างให้เป็นของ root แล้ว API เขียนรูปไม่ได้) — ไม่อยู่ในไฟล์สำรอง DB ต้องสำรองแยก

Deploy เขียน `IMAGE_TAG=sha-xxxxxxx` ลง `~/app/.env` ทุกครั้ง — คำสั่ง `docker compose` ที่รันเองจึงใช้ image ชุดที่ deploy อยู่
(VPS ไม่เก็บ login ของ GHCR ถ้าไปหา `:latest` ที่ไม่มีในเครื่องจะได้ `unauthorized`)

เมนูตั้งต้น (ไม่บังคับ — หมวด/เมนู/ตัวเลือก/วัตถุดิบ ไม่มีบัญชีหรือบิลตัวอย่าง รันซ้ำได้ ไม่ทับของที่ร้านแก้แล้ว):

```bash
cd ~/app && docker compose run --rm migrate npm run prisma:seed:menu
```

คำสั่งดูแลประจำ (`backup once`, `restore-drill.sh`, logs) ใช้ `docker compose` ใน `~/app` แทน `docker compose -f docker-compose.prod.yml` ได้ทุกคำสั่งในเอกสารนี้และ OPERATIONS.md

## B. Caddy ในเครื่องเดียว

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
เพิ่ม/แก้/ปิดใช้งานโต๊ะทีหลัง: หน้า **โต๊ะ / QR** → ปุ่ม **จัดการโต๊ะ** (ADMIN)

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
