# Restaurant POS

ระบบ POS ร้านอาหาร — backend กับ frontend อยู่ใน repo เดียว (รวมด้วย `git subtree` เก็บ history เดิมของทั้งสองฝั่งไว้ครบ)

```
restaurant-pos/
├── backend/    # NestJS + Prisma + PostgreSQL + Socket.IO  (เดิม: Lezmn/Restaurant-Management-Back)
└── frontend/   # React + Vite + TanStack Query + Playwright (เดิม: Lezmn/Restuarant-Front)
```

## เริ่มใช้งาน (dev)

ทั้งสองฝั่งต้องมี `.env` ของตัวเอง (ไม่อยู่ใน git) — ดูตัวอย่างที่ `backend/.env.example` และ `frontend/.env.example`

```bash
# backend: postgres + API (http://localhost:3000)
cd backend
docker compose up -d --build

# frontend: http://localhost:5173
cd frontend
npm install
npm run dev
```

รายละเอียดฝั่ง backend อยู่ใน `backend/README.md`

## Production

- ขึ้นเครื่องจริง: [`docs/DEPLOY.md`](docs/DEPLOY.md) — `docker-compose.prod.yml` (HTTPS อัตโนมัติ, สำรองข้อมูลทุกวัน)
- ดูแลระบบ / สำรอง-กู้ข้อมูล / แผนสำรองเน็ตดับ / บัญชีผู้ใช้: [`docs/OPERATIONS.md`](docs/OPERATIONS.md)
- งานที่เหลือเรียงตาม priority: [`docs/TODO.md`](docs/TODO.md)
- CI: ทุก PR รัน typecheck + unit test + build + Docker image (E2E กดรันเองใน Actions)

## รันเทสต์ — คำสั่งเดียว

```bash
npm run t -- <ไฟล์หรือโฟลเดอร์> [ตัวเลือก]    # รันจากโฟลเดอร์หลักที่ไหนก็ได้ พิมพ์แค่ชื่อไฟล์ก็พอ
npm run t                                      # ไม่ใส่ไฟล์ = unit test ทั้ง backend + frontend
npm run t -- frontend                          # unit test ของหน้าเว็บทั้งหมด (ไม่รวม E2E)
npm run t -- backend                           # unit test ของ backend ทั้งหมด
npm run t -- frontend/test/e2e                 # E2E ทั้งโฟลเดอร์ (Chrome อย่างเดียว ช้า ต้องใช้ DB)
```

สคริปต์ `scripts/t.mjs` เลือกวิธีรันให้เองจากพาธของไฟล์:

| ไฟล์อยู่ที่ | รันด้วย | ต้องใช้ DB ไหม |
|---|---|---|
| `frontend/test/unit/**` | vitest | ไม่ต้อง (วินาที) |
| `backend/test/**` | jest | ไม่ต้อง (เร็ว) |
| `frontend/test/e2e/**` | Playwright ผ่าน `test:e2e:local` (API ทดสอบ `:3100` — ไม่ยิง `:3000` จึงไม่โดน 429) | ต้อง (สคริปต์เปิดให้เอง) |

```bash
npm run t -- discount.test.ts                         # unit หน้าเว็บ (พิมพ์แค่ชื่อไฟล์)
npm run t -- backend/test/unit/line/line.spec.ts      # unit backend
npm run t -- access.spec.ts --headed                  # E2E เปิดเบราว์เซอร์ให้ดู
npm run t -- frontend/test/e2e/admin --ui             # E2E ทั้งโฟลเดอร์ ในหน้าต่าง UI ที่กดเลือกเทสต์ได้
npm run t -- StatusPage.test.tsx -t "ยกเลิก"          # เฉพาะเทสต์ที่ชื่อมีคำนี้ (E2E ใช้ -g)
```

ตัวเลือกที่ขึ้นต้นด้วย `-` ส่งต่อให้ runner นั้นตรง ๆ · E2E ไม่ระบุ `--project` = Chrome อย่างเดียว

## เทสต์ E2E (Playwright)

อยู่ที่ `frontend/test/e2e/` (unit test ของ Vitest อยู่ที่ `frontend/test/unit/`) — ยิง API `localhost:3000` และเว็บ `localhost:5173` ตรง ๆ และ **สร้างข้อมูลจริง**
(เปิดโต๊ะ/ออเดอร์/บิล) จึงควรรันกับฐานข้อมูลทดสอบที่ seed ใหม่ ไม่ใช่ DB ที่ใช้งานอยู่

- backend ตอนรันเทสต์ตั้ง `LOGIN_THROTTLE_LIMIT=1000` (ทุกเคส login ใหม่), `THROTTLE_IP_LIMIT=100000` (ทั้งชุดยิงจาก IP เดียว), `SLIPOK_MOCK=true` และ `LINE_DISABLED=true` (DB ทดสอบอาจมี token LINE จริงค้างอยู่ — เทสต์ปิดยอดจะส่งสรุปเข้า LINE จริง)
- รันซ้ำหลายรอบโต๊ะว่างจะหมด ให้ reset + seed DB ทดสอบใหม่

```bash
cd frontend
npx playwright test --workers=1
```

**คำสั่งเดียวจบ (แนะนำ):** เปิด DB ทดสอบ + ลง migration + เปิด API ทดสอบ `:3100` และเว็บ `:5273` ให้เอง แล้วปิดให้เมื่อเทสต์จบ
(ไม่แตะ API `:3000` — ตัวนั้นจำกัด login 5 ครั้ง E2E จะโดน 429) ต้องเปิด Docker Desktop ก่อน

```bash
cd frontend
npm run test:e2e:local                                         # ทั้งหมด
npm run test:e2e:local -- test/e2e/customer/order-status.spec.ts  # ไฟล์เดียว
npm run test:e2e:local -- -g "เมนูขายดี"                        # ตามชื่อเทสต์
npm run test:e2e:local -- --headed --workers=1 --project=chromium  # เปิดเบราว์เซอร์ให้ดู
```

unit test: `npm test` ในโฟลเดอร์ `frontend` (Vitest) และ `backend` (Jest)

ดู unit test หน้าจอ (`test/unit/pages`, `test/unit/components`) รันใน Chrome จริงแบบเปิดหน้าต่าง — ไม่ต้องเปิด Docker/server:

```bash
cd frontend
npm run test:browser -- test/unit/pages/StatusPage.test.tsx           # ไฟล์เดียว (แก้ไฟล์แล้วรันใหม่เอง กด q ออก)
npm run test:browser -- test/unit/pages/StatusPage.test.tsx -t "ยกเลิก" # ตามชื่อเทสต์
VITEST_SLOWMO=1500 npm run test:browser -- test/unit/pages/SalesPage.test.tsx # ค้างหน้าจอหลังจบแต่ละเทสต์ (ms, ค่าเริ่มต้น 500, 0 = ไม่ค้าง)
```

## หมายเหตุ

- `backend/docker-compose.yml` ล็อกชื่อ project เป็น `restaurant-app` เพื่อใช้ volume ฐานข้อมูลเดิม
  (`restaurant-app_postgres_data_dev`) — ถ้าเปลี่ยนชื่อนี้ compose จะสร้าง DB ใหม่ว่างเปล่า
- Postgres เปิดให้ต่อได้เฉพาะจากเครื่องนี้ (`localhost:5433`)
- ตรวจสลิป PromptPay ด้วย SlipOK: ใส่ `SLIPOK_API_KEY` / `SLIPOK_BRANCH_ID` ใน `backend/.env`
