# ผลสแกน SonarQube

สแกนล่าสุด: **2026-10-30** (branch `chore/remove-bill-split`, SonarQube Community ใน Docker container `sonarqube`)
สแกนก่อนหน้า: 2026-10-22

## สรุปผล

| ตัวชี้วัด | backend (`back-res`) | frontend (`front-res`) |
|---|---|---|
| Quality Gate | ❌ ERROR | ❌ ERROR |
| บรรทัดโค้ด (ncloc) | 15,448 | 29,056 |
| Bugs | 0 (A) | 0 (A) |
| Vulnerabilities | 0 (A) | 4 (C) |
| Security Hotspots | 0 | 0 |
| Code Smells | 28 (A) | 57 (A) |
| Coverage | 88.6% | 77.0% |
| Duplication | 0.1% | 0.3% |
| Test ที่ใช้สร้าง coverage | jest 769 test / 47 suite ผ่านหมด | vitest 519 test / 48 ไฟล์ ผ่านหมด |

เงื่อนไขที่ทำให้ Quality Gate ไม่ผ่าน (Sonar way: เทียบกับ "โค้ดใหม่"):

- `new_coverage` ต้อง ≥ 80% — backend 84.5% ✅, frontend 81.2% ✅
- `new_violations` ต้อง = 0 — backend 28, frontend 60
- `new_duplicated_lines_density` ผ่าน (< 3%) ทั้งคู่

## แก้ไขแล้วหลังสแกนรอบแรก (30 ต.ค.)

- backend `src/` 9 จุด → 0 (nested ternary, `.sort()`, template ซ้อน, `Array()`, import ที่ไม่ได้ใช้)
- frontend S3358 / S4624 21 จุด → 0 (แยกเป็น helper function / `&&` แทน ternary ซ้อน)
- frontend ติดตั้ง `@vitest/coverage-v8` + เพิ่ม test `describeAudit` 9 ข้อ → coverage โค้ดใหม่ผ่านเกณฑ์ 80%
- code smell: backend 37 → 28, frontend 79 → 57

ตารางด้านล่างเป็นผลสแกนรอบแรก (ก่อนแก้)

## backend — 37 issue (ก่อนแก้)

| ไฟล์ | จำนวน | หมายเหตุ |
|---|---|---|
| `prisma/seed-mock.ts` | 26 | สคริปต์ seed ข้อมูลทดสอบ ไม่ได้รันบน production |
| `src/**` | 9 | ดูตารางล่าง |
| `scripts/setup-line.mjs` | 2 | สคริปต์ตั้งค่า LINE ครั้งเดียว |
| `prisma/reset-admin.ts` | 1 | `crypto` → `node:crypto` |

issue ใน `src/` (โค้ดที่รันจริง):

| กฎ | ไฟล์:บรรทัด | เรื่อง |
|---|---|---|
| S3358 | `health/system-status.service.ts:55`, `line/cash-close-summary.ts:38`, `payments/payments.controller.ts:30` | nested ternary |
| S4043 | `health/system-status.service.ts:102` | `.sort()` แก้ array เดิม → ใช้ `toSorted` |
| S4624 | `line/cash-close-summary.ts:43`, `line/line-settings.controller.ts:64` | template literal ซ้อนกัน |
| S7723 | `reports/reports.service.ts:236` | `Array()` → `new Array()` |
| S1128 | `payments/dto/create-payment.dto.ts:5,19` | import ที่ไม่ได้ใช้ (`ArrayMaxSize`, `ValidateNested`) |

เหลือหลังตัดทิ้ง `seed-mock.ts`: ทั้งหมดเป็น Code Smell ระดับ MAJOR/MINOR ไม่มี Bug/ช่องโหว่

## frontend — 83 issue (smell 79 + vulnerability 4) (ก่อนแก้)

| กฎ | จำนวน | ระดับ | เรื่อง |
|---|---|---|---|
| S6551 | 17 | MINOR | object อาจถูกแปลงเป็นข้อความเป็น `[object Object]` |
| S3358 | 16 | MAJOR | nested ternary |
| S2925 | 8 | MAJOR | `waitForTimeout` ใน E2E |
| S6819 | 7 | MAJOR | ใช้ ARIA role แทน element ธรรมชาติ |
| S4624 | 5 | MAJOR | template literal ซ้อนกัน |
| S3776 | 4 | CRITICAL | cognitive complexity สูงเกิน |
| S6845 | 4 | MAJOR | non-interactive element มี handler/tabIndex |
| S1607 | 3 | MAJOR | test ที่ถูก skip |
| S4036 | 3 | MINOR (vuln) | `PATH` ใน `scripts/e2e-local.mjs` |
| S2245 | 1 | MAJOR (vuln) | `Math.random` ใน `src/lib/device.ts:33` |
| อื่น ๆ | 14 | — | S7755, S7780, S1135, S6397, S4666, S8786, S6749, S6853, S6754, S2004, S6582, S8783, S6564 |

### Vulnerability 4 รายการ (security rating C)

- **`src/lib/device.ts:33` (S2245)** — `Math.random` เป็น fallback ของ `randomId()` เมื่อเบราว์เซอร์ไม่มี `crypto.randomUUID` ใช้แค่แยกเครื่องในประวัติ ไม่ใช่ความลับ — false positive ตั้งใจไม่แก้ (หรือใช้ `crypto.getRandomValues` แทนถ้าอยากให้ผ่านกฎ)
- **`scripts/e2e-local.mjs:82,100,104` (S4036)** — สคริปต์ dev เรียกคำสั่งผ่าน `PATH` ไม่เข้า production


## เทียบกับรอบ 2026-10-22

issue ที่ตั้งใจไม่แก้ยังอยู่ (S6564, S1607, S2925, S8783 ดู `docs/TODO.md` หัวข้อ "หมายเหตุ Sonar") ส่วนตัวเลขรอบก่อนไม่ได้บันทึกไว้ จึงไม่มีตารางเทียบ

## ลำดับที่แนะนำให้แก้

1. ~~`src/**` ของ backend 9 รายการ~~ ✅ แก้แล้ว
2. S3776 (complexity) เหลือ 2 จุดใน frontend (`DashboardPage.tsx` บรรทัด 101 และ 375) — ยังไม่ได้แก้
3. ~~S3358 / S4624 ใน frontend~~ ✅ แก้แล้ว
4. Coverage — frontend ✅ (77.0%, new code 81.2%); backend ✅ (88.6%, new code 84.5%) — ตัวเลข 44% ก่อนหน้านี้เกิดจาก Sonar นับไฟล์ test/seed/สคริปต์เป็นโค้ดที่ไม่มี coverage แก้ด้วย `sonar.coverage.exclusions` ใน `backend/sonar-project.properties`
5. `seed-mock.ts` — ถ้าไม่อยากให้นับ เพิ่ม `prisma/seed-mock.ts` ใน `sonar.exclusions` ของ `backend/sonar-project.properties`

## วิธีสแกนซ้ำ

```bash
# 1. เปิด Docker Desktop แล้วเริ่ม SonarQube (ใช้เวลา ~1 นาที จน status = UP)
docker start sonarqube
curl http://localhost:9000/api/system/status

# 2. backend: สร้าง coverage แล้วสแกน
cd backend
npx jest --coverage
npx -y @sonar/scan -Dsonar.host.url=http://localhost:9000 -Dsonar.token=$SONAR_TOKEN

# 3. frontend
cd ../frontend
npx -y @sonar/scan -Dsonar.host.url=http://localhost:9000 -Dsonar.token=$SONAR_TOKEN
```

(frontend ต้องรัน `npm test -- --coverage` ก่อนสแกน เพื่อสร้าง `coverage/lcov.info`)

- `SONAR_TOKEN` เป็น environment variable ของเครื่อง dev ไม่ commit ลง repo
- ดูผล: <http://localhost:9000/dashboard?id=back-res> และ <http://localhost:9000/dashboard?id=front-res>
- ดึงรายการ issue: `GET /api/issues/search?componentKeys=<projectKey>&resolved=false&ps=200`
