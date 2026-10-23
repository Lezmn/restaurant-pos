# งานที่เหลือ (เรียงตาม priority)

อัปเดตล่าสุด: 2026-10-22 — ของที่ทำเสร็จแล้วดู git log / PR ที่ merge แล้ว

## P0 — ต้องทำก่อนส่งงาน / ก่อนเปิดใช้จริง

1. **E2E รวดเดียว** — ✅ ผ่านครบ 111/112 (2026-10-23, DB สด, 3 workers) ข้าม 1 ตั้งใจ (rate limit login ต้องใช้ API แยก)
   - เพิ่มเทสต์: สต็อกอัตโนมัติ, จำนวนลูกค้า (API + QR dialog), บังคับเปลี่ยนรหัส ADMIN (API + หน้าเว็บ), ใบเสร็จพิมพ์เอง
   - รันบนเครื่อง: reset DB ทดสอบก่อนทุกครั้ง (`npx prisma migrate reset --force` กับ DB ทดสอบ) — ข้อมูลค้างจากรอบก่อน
     (โต๊ะเปิดค้างเป็นร้อย) ทำหน้า Check ช้าจนเทสต์หมดเวลา; API ทดสอบต้องตั้ง `LOGIN_THROTTLE_LIMIT=1000`,
     `THROTTLE_IP_LIMIT=100000`, `SLIPOK_MOCK=true`
   - เทสต์ที่เทียบ "ยอดขายทั้งวัน" ติด tag `@totals-*` รันแยกหลังชุดหลักจบ (playwright.config.ts)
2. **SonarQube** — ✅ สแกน + แก้แล้ว (2026-10-22) เหลือที่ตั้งใจไม่แก้ ดู "หมายเหตุ Sonar" ด้านล่าง
   - สแกนซ้ำหลังแก้โค้ดชุดใหญ่: `cd backend && npx jest --coverage` แล้วรัน sonar-scanner ทั้ง backend/frontend
   - frontend ยังไม่มี coverage (ไม่ได้ติดตั้ง `@vitest/coverage-v8`) — ถ้าเกณฑ์วิชาดู coverage ต้องเพิ่ม
3. **Deploy เครื่องจริง** ตาม `docs/DEPLOY.md` — เครื่อง + โดเมน 2 ชื่อ + `.env` ค่าจริง + `seed:prod`
   + `VITE_PROMPTPAY_ID` ของร้าน + `SLIPOK_API_KEY`/`SLIPOK_BRANCH_ID` (ถ้าใช้ตรวจสลิปอัตโนมัติ)
4. **สำรองข้อมูลนอกเครื่อง** — ✅ ระบบพร้อมแล้ว (service `offsite` + `deploy/restore-drill.sh`) เหลือทำตอน deploy:
   `rclone config` ด้วยบัญชี Google ของร้าน → `COMPOSE_PROFILES=offsite` → ซ้อมกู้ครั้งแรก (`docs/OPERATIONS.md`)
5. **Uptime monitor** — ✅ คู่มือพร้อม + backup/offsite ping healthchecks.io ได้แล้ว เหลือทำตอน deploy:
   สมัคร UptimeRobot (keyword `"db":"ok"` ที่ `/health` + หน้าเว็บ + SSL expiry) และ healthchecks.io 2 checks ใส่ URL ใน `.env`

## P1 — ช่วงแรกหลังเปิดใช้

6. **อุปกรณ์ร้าน** — เลือกรุ่นแท็บเล็ต, ทดสอบ Wi-Fi ทุกโต๊ะ, ตั้งคอมเคาน์เตอร์กับเครื่องพิมพ์ใบเสร็จ USB
   ตาม `docs/PRINTING.md` (Chrome `--kiosk-printing` + ติ๊ก "พิมพ์ใบเสร็จทันที") แล้วลองพิมพ์จริง
7. **อบรมพนักงาน + ซ้อมแผนสำรองเน็ตดับ** — กระดาษสั่งอาหาร, กรอกย้อนหลัง, ปิดยอดลิ้นชัก (`docs/OPERATIONS.md`)
8. **สร้าง ADMIN สำรอง** อย่างน้อย 2 บัญชี (เจ้าของ + ผู้จัดการ) — ระบบไม่มี "ลืมรหัสผ่าน" ทางอีเมล
9. **เก็บกวาด repo / เครื่อง dev**
   - ลบ branch ที่ merge แล้ว: `feat/auto-stock`, `fix/menu-toggle-delay`, `test/qa-suite`, `design/staff-check-manage`,
     `feat/users-page`, `feat/shared-accounts` (และ `feat/production-ready` หลัง merge)
   - ลบ worktree `.claude/worktrees/auto-stock` และ DB ทดสอบ `restaurant_e2e`, `restaurant_stock`, `restaurant_bugtest`
   - `restaurant_db` (dev): โต๊ะ 2, 5, 6 มี session เปิดค้างมาตั้งแต่ก่อนรอบทดสอบ + บิลทดสอบพิมพ์ใบเสร็จ
     (โต๊ะ 2 ฿20, โต๊ะ 5 ฿30) — ปิดหรือ reseed
   - `backend/issues.json`, `frontend/issues.json` = ผลสแกน Sonar เก่า (23 ก.ย.) ไม่ได้ใช้แล้ว ลบได้
10. **ลิงก์ `docs/PRINTING.md`** ใน README หลัง merge PR พิมพ์ใบเสร็จ (#6)

## P2 — ตามความต้องการของร้าน

11. **VAT / ใบกำกับภาษี / ส่วนลด % / หารบิล** — ต้องย้ายราคาไปหน่วยสตางค์ก่อน (ตอนนี้เป็นบาทจำนวนเต็ม)
12. **ช่อง "ชื่อผู้ทำ"** ตอนปิดยอดลิ้นชัก / void บิล / เบิกเงิน — บัญชีกลางบอกได้แค่ตำแหน่ง ไม่รู้ว่าใคร
13. **ย้าย JWT จาก localStorage ไป httpOnly cookie** — ลดผลกระทบถ้ามี XSS (ตอนนี้มี CSP ช่วยอยู่แล้ว ต้องแก้ทั้ง backend และ frontend)
14. **NestJS 12** — เป็น ESM-only ต้องย้าย backend + Jest เป็น ESM ทั้งโปรเจกต์ (11.2.7 ตอนนี้ไม่มีช่องโหว่)
    และ **Prisma 5 → รุ่นใหม่** (major) ทำพร้อมกันได้
15. **ดีไซน์** — ยืนยันสี `table-head`, `accent-olive`, `promptpay` กับ Figma; ทำโลโก้ร้าน

16. **พิมพ์ใบสั่งเข้าครัวอัตโนมัติ** — ต้องใช้เครื่องพิมพ์แบบ LAN + service ส่ง ESC/POS (ภาษาไทยต้องเรนเดอร์เป็นรูป)
    ตอนนี้พิมพ์ได้แค่ใบเสร็จผ่านเบราว์เซอร์ที่เครื่องเคาน์เตอร์

## หมายเหตุ Sonar (ตั้งใจไม่แก้)

- `typescript:S6564` type `Id = string` — ใช้ทั้งโปรเจกต์บอกว่าเป็น id ไม่ใช่ข้อความทั่วไป แก้แล้วอ่านยากขึ้น
- `S1607` test ที่ข้ามเมื่อไม่ได้ตั้ง `E2E_THROTTLED_API_URL` — ต้องใช้ API อีกตัวที่ตั้ง rate limit ต่ำ
- `S2925` `waitForTimeout` ใน 2 เทสต์ — เป็นการพิสูจน์ว่า "ไม่มีอะไรเกิดขึ้นเพิ่ม" (ไม่สั่งซ้ำ/ไม่ refetch) ต้องรอจริง
- `S8783` `click({ force: true })` ใน opentable — คลิกแรกตั้งใจให้ไปโดน modal ที่บังอยู่เพื่อปิดมัน

## หมายเหตุเทคนิค

- lockfile ของ backend สร้างด้วย npm 10 (ตรงกับ node:22 ใน Docker/CI) — ถ้าเครื่อง dev ใช้ npm 11 แล้ว `npm install` ทำให้ lockfile เปลี่ยน
  ให้สร้างใหม่ใน container: `docker run --rm -v "$PWD:/app" -w /app node:22-alpine npm install --package-lock-only`
- ไฟล์ที่รันใน container (`*.sh`, `Caddyfile`, `Dockerfile`, `*.yml`) ถูกบังคับเป็น LF ผ่าน `.gitattributes`
- image `web` (Caddy) รันเป็น user `caddy` ไม่ใช่ root — ถ้าเคย deploy ด้วย image เก่า (root) มาก่อน volume `caddy_data`
  จะเป็นของ root ต้อง `docker compose -f docker-compose.prod.yml run --rm --user root web chown -R caddy:caddy /data /config` ครั้งเดียว
