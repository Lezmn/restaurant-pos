# งานที่เหลือ (เรียงตาม priority)

อัปเดตล่าสุด: 2026-10-22 — ของที่ทำเสร็จแล้วดู git log / PR ที่ merge แล้ว

## P0 — ต้องทำก่อนส่งงาน / ก่อนเปิดใช้จริง

1. **E2E รวดเดียว** — ระหว่างทำฟีเจอร์ตกลงกันว่าไม่รัน E2E ทุกครั้ง จึงต้องทำตอนท้าย:
   - เพิ่มเทสต์ของฟีเจอร์ใหม่: สต็อกอัตโนมัติ (ตั้งยอด → สั่ง → หมด → ยกเลิกคืนยอด), จำนวนลูกค้าใน QR dialog + Dashboard,
     บังคับเปลี่ยนรหัส ADMIN ครั้งแรก, ปุ่มเปลี่ยนรหัสเฉพาะ ADMIN
   - ไล่แก้ selector ที่ข้อความบนจอเปลี่ยน (ถ้ามี)
   - รันครบทั้งชุดครั้งเดียว: GitHub → Actions → CI → Run workflow (ติ๊ก e2e) หรือรันบนเครื่องตาม README
2. **SonarQube** — สแกนโค้ดชุดล่าสุดแล้วแก้ issue ที่ขึ้น (เกณฑ์วัดผลของวิชา)
3. **Deploy เครื่องจริง** ตาม `docs/DEPLOY.md` — เครื่อง + โดเมน 2 ชื่อ + `.env` ค่าจริง + `seed:prod`
   + `VITE_PROMPTPAY_ID` ของร้าน + `SLIPOK_API_KEY`/`SLIPOK_BRANCH_ID` (ถ้าใช้ตรวจสลิปอัตโนมัติ)
4. **สำรองข้อมูลนอกเครื่อง** — ตั้ง `rclone` คัดลอก `./backups` ออกไปที่อื่นทุกวัน และซ้อมกู้ข้อมูล 1 ครั้ง (`docs/OPERATIONS.md`)
5. **Uptime monitor** — ตั้ง UptimeRobot/Better Stack ยิง `https://API_DOMAIN/health` แจ้งเตือนเข้า LINE/อีเมลเจ้าของร้าน

## P1 — ช่วงแรกหลังเปิดใช้

6. **อุปกรณ์ร้าน** — เลือกรุ่นแท็บเล็ต, เครื่องพิมพ์ใบเสร็จ (ตอนนี้พิมพ์ผ่าน browser ยังไม่รองรับเครื่องพิมพ์ความร้อนตรง ๆ), ทดสอบ Wi-Fi ทุกโต๊ะ
7. **อบรมพนักงาน + ซ้อมแผนสำรองเน็ตดับ** — กระดาษสั่งอาหาร, กรอกย้อนหลัง, ปิดยอดลิ้นชัก (`docs/OPERATIONS.md`)
8. **สร้าง ADMIN สำรอง** อย่างน้อย 2 บัญชี (เจ้าของ + ผู้จัดการ) — ระบบไม่มี "ลืมรหัสผ่าน" ทางอีเมล
9. **เก็บกวาด repo / เครื่อง dev**
   - ลบ branch ที่ merge แล้ว: `feat/auto-stock`, `fix/menu-toggle-delay`, `test/qa-suite`, `design/staff-check-manage`,
     `feat/users-page`, `feat/shared-accounts` (และ `feat/production-ready` หลัง merge)
   - ลบ worktree `.claude/worktrees/auto-stock` และ DB ทดสอบ `restaurant_e2e`, `restaurant_stock`, `restaurant_bugtest`
   - `restaurant_db` (dev): โต๊ะ 2, 5, 6 มี session เปิดค้างมาตั้งแต่ก่อนรอบทดสอบ — ปิดหรือ reseed

## P2 — ตามความต้องการของร้าน

10. **VAT / ใบกำกับภาษี / ส่วนลด % / หารบิล** — ต้องย้ายราคาไปหน่วยสตางค์ก่อน (ตอนนี้เป็นบาทจำนวนเต็ม)
11. **ช่อง "ชื่อผู้ทำ"** ตอนปิดยอดลิ้นชัก / void บิล / เบิกเงิน — บัญชีกลางบอกได้แค่ตำแหน่ง ไม่รู้ว่าใคร
12. **ย้าย JWT จาก localStorage ไป httpOnly cookie** — ลดผลกระทบถ้ามี XSS (ตอนนี้มี CSP ช่วยอยู่แล้ว ต้องแก้ทั้ง backend และ frontend)
13. **NestJS 12** — เป็น ESM-only ต้องย้าย backend + Jest เป็น ESM ทั้งโปรเจกต์ (11.2.7 ตอนนี้ไม่มีช่องโหว่)
    และ **Prisma 5 → รุ่นใหม่** (major) ทำพร้อมกันได้
14. **ดีไซน์** — ยืนยันสี `table-head`, `accent-olive`, `promptpay` กับ Figma; ทำโลโก้ร้าน

## หมายเหตุเทคนิค

- lockfile ของ backend สร้างด้วย npm 10 (ตรงกับ node:22 ใน Docker/CI) — ถ้าเครื่อง dev ใช้ npm 11 แล้ว `npm install` ทำให้ lockfile เปลี่ยน
  ให้สร้างใหม่ใน container: `docker run --rm -v "$PWD:/app" -w /app node:22-alpine npm install --package-lock-only`
- ไฟล์ที่รันใน container (`*.sh`, `Caddyfile`, `Dockerfile`, `*.yml`) ถูกบังคับเป็น LF ผ่าน `.gitattributes`
