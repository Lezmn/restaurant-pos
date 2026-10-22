# Restaurant Management API

สแตก: NestJS + Prisma + PostgreSQL + Docker


## โครงสร้างโปรเจกต์

```
restaurant-app/
├── docker-compose.yml      # postgres + app (dev mode)
├── Dockerfile
├── .env.example
├── prisma/
│   ├── schema.prisma       # data model หลัก (User, Category, MenuItem, MenuOption, Ingredient,
│   │                       #   RestaurantTable, TableSession, Order, OrderItem, OrderItemOption,
│   │                       #   Payment, Receipt, ReceiptItem, ServiceRequest, Expense)
│   ├── migrations/
│   ├── seed.ts             # ข้อมูล demo สำหรับ dev
│   └── seed-prod.ts        # ติดตั้งร้านจริง: ADMIN คนแรก + โต๊ะ
└── src/
    ├── main.ts             # bootstrap + ValidationPipe + Swagger + helmet + CORS
    ├── app.module.ts       # root module รวมทุก feature module
    ├── prisma/             # PrismaService แบบ global module
    ├── common/             # DecimalInterceptor (Decimal → number ทุก response), util ช่วงวันที่
    ├── auth/               # login, /auth/me, เปลี่ยนรหัส, JwtAuthGuard + RolesGuard (global)
    ├── users/              # CRUD พนักงาน
    ├── categories/         # หมวดหมู่เมนู
    ├── menu/               # เมนู + option ของเมนู
    ├── ingredients/        # วัตถุดิบ ผูกกับตัวเลือกเมนู (ครัวเปิด/ปิดได้)
    ├── tables/             # โต๊ะ
    ├── table-sessions/     # เปิด/ปิด QR session ต่อโต๊ะ
    ├── orders/             # ออเดอร์ + รายการสั่งในออเดอร์
    ├── payments/           # ชำระเงินต่อ session หรือเลือกบางออเดอร์ (ออก receipt อัตโนมัติ), void
    ├── service-requests/   # คำขอจากโต๊ะ เช่น เรียกพนักงาน, ขอเช็คบิล
    ├── expenses/           # รายจ่ายร้าน
    ├── reports/            # dashboard, รายรับ-รายจ่าย
    ├── events/             # WebSocket gateway (socket.io) push event ให้ POS/ครัว/ลูกค้า
    └── public/             # endpoint ฝั่งลูกค้า (ไม่ต้อง login) ใช้คู่กับ QR session
```

## Auth และสิทธิ์

- Login ผ่าน `POST /auth/login` ได้ JWT กลับมา ใช้แนบใน header `Authorization: Bearer <token>`
- Guard เป็น global (`JwtAuthGuard` + `RolesGuard`) ทุก endpoint ต้อง login ตามค่าเริ่มต้น
- ใส่ `@Public()` ที่ controller/route เพื่อยกเว้นการ login (ใช้กับ `auth/login` และ endpoint ใน `public/` ทั้งหมด)
- ใส่ `@Roles(Role.ADMIN, ...)` เพื่อจำกัดสิทธิ์ตาม role

| role | ใช้ทำอะไร |
|---|---|
| `ADMIN` | ทุกอย่าง รวมถึง users, expenses, reports, เพิ่ม/ลบวัตถุดิบ |
| `STAFF` | หน้าร้าน/แคชเชียร์: สั่งอาหาร, แก้รายการ, รับเงิน, จัดการคำขอจากโต๊ะ |
| `KITCHEN` | ครัว: เปลี่ยนสถานะออเดอร์, เปิด/ปิดวัตถุดิบ |

สิทธิ์ราย endpoint ดูได้ใน Swagger

## วิธีรัน 

ทั้งสองวิธีต้องมี `.env` ก่อน — compose จะ error ทันทีถ้าไม่ได้ตั้ง `POSTGRES_PASSWORD` / `JWT_SECRET`

```bash
cp .env.example .env
```

ค่าใน `.env.example` ใช้ dev ได้เลย

### วิธีที่ 1: รันทุกอย่างผ่าน Docker (แนะนำสำหรับเริ่มต้น)

```bash
# 1. สร้าง postgres + รัน Nest app (รัน prisma migrate deploy ให้อัตโนมัติก่อน start)
docker compose up --build -d

# 2. (ไม่บังคับ) ใส่ข้อมูล demo
docker compose exec app npm run prisma:seed
```

| | URL |
|---|---|
| API | `http://localhost:3000` |
| Swagger | `http://localhost:3000/docs` |

Postgres เปิด port `5433` เฉพาะ `127.0.0.1` ของเครื่อง host (ไม่ชนกับ Postgres ที่ลงไว้ในเครื่อง และเครื่องอื่นในวง LAN ต่อตรงไม่ได้) — ดู DB ด้วย client ในเครื่อง เช่น DBeaver/psql ที่ `localhost:5433`

> **Docker บน Windows:** แก้ไฟล์ใน `src/` แล้ว `nest --watch` ใน container มักไม่เห็นการเปลี่ยนแปลง ให้รัน `docker compose restart app`

### วิธีที่ 2: รัน Postgres ใน Docker, รัน Nest app แบบ local

```bash
# 1. รันแค่ postgres
docker compose up postgres -d

# 2. ติดตั้ง dependencies
npm install

# 3. สร้างตารางจาก migrations ที่มีอยู่
npx prisma migrate deploy

# 4. (ไม่บังคับ) ใส่ข้อมูล demo
npm run prisma:seed

# 5. รัน dev server
npm run start:dev
```

`DATABASE_URL` ใน `.env` ชี้ `localhost:5433` ไว้แล้วสำหรับวิธีนี้

### ข้อมูล demo (`prisma:seed`)

สร้างหมวดหมู่ เมนู option วัตถุดิบ โต๊ะ QR session ออเดอร์หลายสถานะ ใบเสร็จ และรายจ่ายตัวอย่าง แนะนำให้รันครั้งเดียวบน DB ใหม่

บัญชีที่ได้:

| role | email |
|---|---|
| ADMIN | `admin@restaurant.local` |
| STAFF | `staff@restaurant.local` |
| KITCHEN | `kitchen@restaurant.local` |

รหัสผ่านทุกบัญชีคือค่า `seedPassword` ใน `prisma/seed.ts` — ตอนรัน seed จะพิมพ์ตารางบัญชี และ token ของ QR session demo ออกมาให้ด้วย

## คำสั่งที่ใช้บ่อย

| คำสั่ง | ใช้ทำอะไร |
|---|---|
| `npx prisma studio` | เปิด GUI ดู/แก้ข้อมูลใน database |
| `npx prisma migrate dev --name <ชื่อ>` | สร้าง migration ใหม่หลังแก้ `schema.prisma` |
| `npx prisma migrate deploy` | apply migrations ที่มีอยู่ (ไม่สร้างใหม่) |
| `npx prisma generate` | generate Prisma Client ใหม่ (รันอัตโนมัติหลัง install อยู่แล้ว) |
| `docker compose restart app` | restart API หลังแก้โค้ด (Docker บน Windows) |
| `docker compose down -v` | ลบ container **และ volume ข้อมูล DB** — เริ่ม DB ใหม่หมด |

## API Docs

ดูรายการ endpoint ทั้งหมด (path, method, role, request/response) ได้ที่ Swagger: `http://localhost:3000/docs`

## ความปลอดภัยที่มีแล้ว

| | รายละเอียด |
|---|---|
| รหัสผ่าน | bcrypt cost 12 |
| JWT | หมดอายุตาม `JWT_EXPIRES_IN` (default 8h) ตรวจ role ทุก endpoint ด้วย `RolesGuard` |
| Rate limit | ทั้งแอป `THROTTLE_LIMIT` ครั้ง/นาที/คน (พนักงาน/QR โต๊ะ, default 600) · รวมต่อ IP `THROTTLE_IP_LIMIT` (default 1000) · `/auth/login` 5 ครั้ง/นาที/IP · เกินตอบ `429` |
| Security headers | `helmet` (ปิด CSP ให้ Swagger UI) |
| Swagger | dev เปิดเสมอ · `NODE_ENV=production` ปิด เปิดชั่วคราวด้วย `SWAGGER_ENABLED=true` |
| WebSocket | ต้องมี JWT หรือ QR session token ตอน handshake ไม่งั้นตัดทิ้ง |
| QR session | token 48 ตัวอักษรสุ่ม หมดอายุ 3 ชม. ปิดโต๊ะแล้วใช้ต่อไม่ได้ |
| เปลี่ยนรหัสตัวเอง | `PATCH /auth/password` ส่ง `currentPassword` + `newPassword` ทุก role ใช้ได้ |
| Container | รันเป็น user `node` ไม่ใช่ root · `.dockerignore` กัน `.env` ไม่ให้ติดเข้า image |

ค่าลับทั้งหมดอ่านจาก `.env` (ไม่ commit) — `docker-compose.yml` ไม่มีรหัสจริงอยู่ในไฟล์

## Production

ใช้ `docker-compose.prod.yml` ที่โฟลเดอร์ราก repo — ขั้นตอนเต็มอยู่ที่ [`../docs/DEPLOY.md`](../docs/DEPLOY.md)

- `Dockerfile` มี 3 target: `dev` (compose ไฟล์นี้), `build` (migrate + seed:prod), `prod` (`node dist/main` ไม่มี devDependencies)
- Caddy ทำ HTTPS อัตโนมัติ + reverse proxy, API ตั้ง `TRUST_PROXY=true` ให้เอง
- `GET /health` เช็ค DB — ใช้กับ HEALTHCHECK / uptime monitor
- สำรองข้อมูลทุกวัน + กู้ข้อมูล: [`../docs/OPERATIONS.md`](../docs/OPERATIONS.md)

สร้าง ADMIN คนแรก (ห้ามใช้ `prisma:seed` ที่เป็นข้อมูล demo):

```bash
docker compose -f docker-compose.prod.yml run --rm -e ADMIN_EMAIL=owner@restaurant.local -e ADMIN_PASSWORD='<รหัสชั่วคราว>' -e TABLE_COUNT=8 migrate npm run prisma:seed:prod
```

ADMIN คนแรกต้องตั้งรหัสใหม่ตอน login ครั้งแรก (`ADMIN_MUST_CHANGE_PASSWORD=false` ถ้าเจ้าของร้านพิมพ์รหัสเอง) — รันซ้ำได้ ไม่ทับข้อมูลเดิม
แล้วเพิ่มบัญชีกลางของครัว/หน้าร้านที่หน้า "บัญชีผู้ใช้"

## WebSocket (realtime)

Server push event ผ่าน socket.io ที่ port เดียวกับ REST (`http://localhost:3000`) — client ไม่ต้อง poll

**ต่อ socket** ส่ง auth มาใน handshake อย่างใดอย่างหนึ่ง:

```js
import { io } from 'socket.io-client'
io('http://localhost:3000', { auth: { token: '<JWT พนักงาน>' } })        // เข้าห้อง staff
io('http://localhost:3000', { auth: { sessionToken: '<token จาก QR>' } }) // เข้าห้องของ session ตัวเอง
```

ไม่ส่ง auth / token ผิด / session ปิดแล้ว → server ส่ง `error` แล้วตัดการเชื่อมต่อทันที

**Event ที่ server ส่ง** (payload มีแค่ id + สถานะ ให้ client ไป refetch REST เอง)

| event | ส่งให้ | เมื่อ |
|---|---|---|
| `order.created` / `order.updated` | staff + ลูกค้าโต๊ะนั้น | สั่งใหม่ / เปลี่ยนสถานะ / แก้รายการ |
| `service-request.created` / `.updated` | staff + ลูกค้าโต๊ะนั้น | เรียกพนักงาน / ขอเช็คบิล / รับเรื่องแล้ว |
| `payment.created` / `payment.voided` | staff + ลูกค้าโต๊ะนั้น | รับเงิน (มี receipt ติดมา) / ยกเลิกบิล |
| `table-session.created` / `.closed` | staff (+ ลูกค้าตอนปิด) | เปิด QR / ปิดโต๊ะหรือหมดอายุ |
| `menu.updated` | ทุกคน | เพิ่ม/แก้/ลบวัตถุดิบ (ตัวเลือกเมนูที่ผูกไว้เปลี่ยน ให้ refetch เมนู) |

ชื่อ event ทั้งหมดอยู่ที่ `src/events/events.gateway.ts` (`ServerEvent`) — frontend มี map event → query key ที่ `features/live/hooks.ts`

CORS ของ socket ใช้ `CORS_ORIGIN` ตัวเดียวกับ REST (ตั้งใน `SocketIoAdapter`, `main.ts`)

