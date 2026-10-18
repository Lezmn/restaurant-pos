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

## เทสต์ E2E (Playwright)

อยู่ที่ `frontend/test/` — ยิง API `localhost:3000` และเว็บ `localhost:5173` ตรง ๆ และ **สร้างข้อมูลจริง**
(เปิดโต๊ะ/ออเดอร์/บิล) จึงควรรันกับฐานข้อมูลทดสอบที่ seed ใหม่ ไม่ใช่ DB ที่ใช้งานอยู่

- backend ตอนรันเทสต์ตั้ง `LOGIN_THROTTLE_LIMIT=1000` (ทุกเคส login ใหม่) และ `SLIPOK_MOCK=true`
- รันซ้ำหลายรอบโต๊ะว่างจะหมด ให้ reset + seed DB ทดสอบใหม่

```bash
cd frontend
npx playwright test --workers=1
```

## หมายเหตุ

- `backend/docker-compose.yml` ล็อกชื่อ project เป็น `restaurant-app` เพื่อใช้ volume ฐานข้อมูลเดิม
  (`restaurant-app_postgres_data_dev`) — ถ้าเปลี่ยนชื่อนี้ compose จะสร้าง DB ใหม่ว่างเปล่า
- Postgres เปิดให้ต่อได้เฉพาะจากเครื่องนี้ (`localhost:5433`)
- ตรวจสลิป PromptPay ด้วย SlipOK: ใส่ `SLIPOK_API_KEY` / `SLIPOK_BRANCH_ID` ใน `backend/.env`
