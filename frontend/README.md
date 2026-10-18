# Restuarant-Front

หน้าบ้านของระบบจัดการร้านอาหาร — ใช้คู่กับ API ในโปรเจกต์ `restaurant-app` (NestJS + Prisma + PostgreSQL)

> **สถานะปัจจุบัน: ต่อกับ API จริงครบทุกหน้าแล้ว** ไม่มีข้อมูลจำลองเหลืออยู่
> วิธีรันดูที่หัวข้อ [ต่อกับ backend จริง](#ต่อกับ-backend-จริง)

---

## Tech stack

| ชั้น | ตัวที่ใช้ |
|---|---|
| Build | Vite 8 |
| UI | React 19 + TypeScript |
| Routing | React Router 7 |
| Server state | TanStack Query 5 |
| Client state | Zustand (ใช้แค่ตะกร้าฝั่งลูกค้า) |
| Styling | Tailwind CSS 4 (`@theme` ใน `src/index.css`) |
| Lint | oxlint |
| ฟอนต์ | IBM Plex Sans Thai |

ไม่ได้ลง chart library — กราฟใน Dashboard เขียน SVG เองที่ `components/ui/TrendChart.tsx`

---

## เริ่มใช้งาน

```bash
npm install
npm run dev
```

เปิด http://localhost:5173 (ล็อกพอร์ตด้วย `strictPort` ถ้าพอร์ตไม่ว่างจะ error แทนที่จะเลื่อนไป 5174 เงียบ ๆ)

| คำสั่ง | ใช้ทำอะไร |
|---|---|
| `npm run dev` | dev server |
| `npm run build` | ตรวจ type แล้ว build ลง `dist/` |
| `npm run preview` | เปิดดูผลลัพธ์ที่ build แล้ว |
| `npm run lint` | oxlint |

---

## 3 ฝั่งของแอป

แอปเดียว ผู้ใช้ 3 กลุ่ม แยกด้วย URL prefix

### 1. ลูกค้า — `/t/:token` (ไม่ต้อง login)

เข้าผ่าน QR ที่โต๊ะ โดย `token` คือ token ของ `TableSession`

| path | หน้า |
|---|---|
| `/t/:token` | เมนู — ค้นหา, กรองหมวด, การ์ดกริด |
| `/t/:token/menu/:menuItemId` | รายละเอียดเมนู — เลือกตัวเลือก + หมายเหตุ |
| `/t/:token/cart` | ตะกร้า |
| `/t/:token/bill` | เช็คบิล + เลือกวิธีชำระเงิน |
| `/t/:token/status` | ติดตามสถานะออเดอร์ |

ลองได้ที่ `/t/demo-token-a1` (โต๊ะ 12) หรือ `/t/demo-token-a2` (โต๊ะ 2)

### 2. พนักงาน — `/employee/*` (ต้อง login)

แถบล่าง 4 ปุ่มตามดีไซน์ **Order · Check · Manage · Logout**

| path | หน้า | role ที่เข้าได้ |
|---|---|---|
| `/employee/order` | คิวครัวแบบ kanban 3 คอลัมน์ | ADMIN, KITCHEN |
| `/employee/check` | ตารางโต๊ะ / ยอดที่ต้องจ่าย | ADMIN, WAITER, CASHIER |
| `/employee/manage` | จัดการเมนู + เปิด/ปิดการขาย | ADMIN |

ปุ่มที่ role ไม่มีสิทธิ์จะแสดงแบบจางและกดไม่ได้ (ไม่ได้ซ่อน — ตามดีไซน์ที่โชว์ครบ 4 ปุ่ม)

หน้าที่เข้าได้ทาง URL แต่ไม่อยู่ในแถบล่าง เพราะดีไซน์ไม่มี: `/employee/orders`, `/tables`, `/requests`, `/users`

### 3. เจ้าของร้าน — `/owner/*` (ADMIN เท่านั้น)

| path | หน้า |
|---|---|
| `/owner/dashboard` | สรุปรายวัน + กราฟ 7 วัน + สถานะวันนี้ + การแจ้งเตือน |
| `/owner/finance` | รายรับ-รายจ่าย + ฟอร์มบันทึกรายจ่าย |


### บัญชีทดลอง (จาก `prisma/seed.ts` ฝั่ง backend)

รหัสผ่าน **`ChangeMe123!`** ทุกบัญชี — หน้า login กรอกแค่ชื่อผู้ใช้ ระบบเติม `@restaurant.local` ให้เอง
(ตั้งโดเมนได้ที่ `VITE_LOGIN_EMAIL_DOMAIN`; พิมพ์อีเมลเต็มก็ได้)

| ผู้ใช้ | role |
|---|---|
| `admin` | ADMIN (+ เข้า `/owner` ได้) |
| `kitchen` | KITCHEN |
| `cashier` | STAFF |
| `waiter` | STAFF |

---

## โครงสร้างโปรเจกต์

```
src/
├── App.tsx / main.tsx / routes.tsx
├── types/            enums.ts (ตรงกับ prisma), models.ts, reports.ts
├── lib/
│   ├── api-client.ts     fetch wrapper — แนบ Bearer, เจอ 401 เด้ง login
│   ├── auth-storage.ts   เก็บ token/user ใน localStorage
│   ├── format.ts         formatBaht / formatTime
│   ├── query-client.ts   ตั้งค่า TanStack Query
│   └── map.ts            แปลง response ดิบ (types/api.ts) เป็น type ของหน้าจอ (types/models.ts)
├── features/         จับคู่ 1:1 กับ module ฝั่ง NestJS
│   └── <feature>/
│       ├── api.ts        เรียก endpoint ผ่าน apiClient
│       └── hooks.ts      useQuery / useMutation
├── components/
│   ├── ui/               Badge, Card, StatCard, FoodImage, TrendChart, ...
│   ├── layout/           CustomerLayout, EmployeeLayout, OwnerLayout, ProtectedRoute
│   └── ErrorBoundary.tsx
└── pages/
    ├── customer/  employee/  owner/
    └── NotFoundPage.tsx
```

**กติกาสำคัญ:** component ห้ามเรียก `fetch` เอง ต้องผ่าน `features/*/api.ts` เสมอ
และรูปร่าง response ของ backend ให้แปลงที่ `lib/map.ts` ที่เดียว ไม่ให้รั่วเข้าหน้าจอ

---

## ระบบสี

สีทั้งหมดอยู่ใน `@theme` ที่ `src/index.css` ที่เดียว — **ห้ามเขียน hex ตรงในไฟล์ component**

| กลุ่ม | token |
|---|---|
| แบรนด์ (ค่าจาก Figma) | `brand-50` … `brand-500` (`#fff4e9` → `#9c5715`) |
| การ์ดเมนู | `ink` `price` |
| ตะกร้า / บิล | `listing` `text` `amount` `accent-pink` `qty` `minus` `plus` |
| ฟอร์ม | `field` `field-text` |
| สถานะ | `status-queue` `status-cooking` `status-done` `success` `danger` |
| อื่น ๆ | `table-head` `accent-olive` |

ใช้ผ่านชื่อ เช่น `bg-brand-300`, `text-price`

> `table-head` กับ `accent-olive` ยังไม่ได้ยืนยันค่ากับ Figma (โควตา MCP หมด) — มี `NOTE` กำกับไว้ในไฟล์แล้ว

---

## Responsive

ออกแบบให้ใช้ได้ทุกอุปกรณ์ ไม่ใช่แค่ขนาดที่มีในดีไซน์

| ฝั่ง | มือถือ | แท็บเล็ต / เดสก์ท็อป |
|---|---|---|
| ลูกค้า | แถบล่าง 4 แท็บ, กริด 2 คอลัมน์ | nav ย้ายขึ้น header, กริด 3–4 คอลัมน์, หน้ารายละเอียดเป็น 2 คอลัมน์ |
| พนักงาน | kanban เรียงลงล่าง, แถบล่างเหลือไอคอน | kanban 3 คอลัมน์, ปุ่มมีข้อความ |
| เจ้าของร้าน | sidebar กลายเป็นแถบบนเลื่อนแนวนอน | sidebar ซ้ายค้าง |

รองรับ notch ด้วย `min-h-dvh` + `env(safe-area-inset-bottom)`

---

## ต่อกับ backend จริง

1. เปิด API — ในโปรเจกต์ `restaurant-app` รัน `docker compose up -d` (API ที่ `:3000`)
2. สร้าง `.env` ที่รากโปรเจกต์นี้

   ```
   VITE_API_URL=http://localhost:3000
   ```

3. `npm run dev` แล้วเปิด `http://localhost:5173`

> image ของ `restaurant_api` ใน docker คัดลอก `prisma/` ตอน build (mount แค่ `src/`)
> ถ้า schema/migration ฝั่ง backend เปลี่ยน ต้อง `docker compose up -d --build app` ไม่งั้น Nest จะ compile ไม่ผ่าน

ฝั่ง backend เตรียมไว้ให้แล้ว 2 อย่าง:
- `app.enableCors()` — ตั้ง origin ผ่าน env `CORS_ORIGIN`
- `DecimalInterceptor` — แปลง `Decimal` เป็น `number` ก่อนส่ง JSON ไม่งั้นราคาจะมาเป็น string `"50"`

---

## ข้อจำกัดที่รู้อยู่

**รอ backend**

| หน้า / ฟีเจอร์ | ต้องมีอะไรก่อน |
|---|---|
| แท็บ "วัตถุดิบ" ใน Manage | Ingredient model |
| "ลูกค้าเข้าใช้บริการ" บน Dashboard | backend ไม่ได้นับหัวลูกค้า — ตอนนี้แสดง "รายจ่ายวันนี้" แทน |
| หมายเหตุแคชเชียร์บนใบเสร็จ | field ใน Payment/Receipt (ตอนนี้พิมพ์ลงกระดาษอย่างเดียว) |

**ยังไม่ได้ทำ**

- หน้า Cashier / Users ยังเป็น placeholder
- **ไม่มีหน้าสร้าง QR code ให้โต๊ะ** — พนักงานยังไม่มีทางส่งลิงก์ `/t/:token` ให้ลูกค้า
- ETA "10-15 นาที" ยัง hardcode
- ยังไม่มี test และ Prettier

**เรื่องเงิน**

ตอนนี้ส่งเป็น `number` หน่วยบาท พอสำหรับราคาจำนวนเต็ม แต่ถ้าจะเพิ่ม **VAT / ส่วนลดเป็น % / หารบิล**
ควรย้ายไปใช้ **จำนวนเต็มหน่วยสตางค์** (`฿50.25` → `5025`) ก่อนเริ่มทำฟีเจอร์นั้น ไม่ใช่หลังจากนั้น

---

