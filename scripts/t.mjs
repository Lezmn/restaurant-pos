// คำสั่งเดียวรันเทสต์: npm run t -- <ไฟล์หรือโฟลเดอร์> [ตัวเลือกของ runner นั้น]
// เลือกวิธีรันจากพาธของไฟล์ ไม่ต้องจำว่าต้อง cd ไหน หรือ E2E ต้องใส่ :local
//
//   frontend/test/e2e/**   → npm run test:e2e:local   (Playwright + API ทดสอบ :3100 — ไม่ยิง :3000 จึงไม่โดน 429)
//   frontend/test/unit/**  → vitest run               (เร็ว ไม่ต้องใช้ DB)
//   backend/test/**        → jest                     (เร็ว ไม่ต้องใช้ DB)
//   ไม่ใส่ไฟล์              → unit ทั้งสองฝั่ง (ไม่รัน E2E เพราะช้า — สั่ง E2E ทั้งชุดเองด้วย npm run t -- frontend/test/e2e)
//
// ใส่พาธแบบเต็ม (frontend/test/...) หรือสั้น (test/unit/lib/discount.test.ts / discount.test.ts) ก็ได้
// ตัวเลือกที่ขึ้นต้น - ส่งต่อให้ runner เช่น --headed, --ui, -t "ชื่อเทสต์", -g "ชื่อเทสต์"
//
// ตัวอย่าง:
//   npm run t -- frontend/test/unit/lib/discount.test.ts
//   npm run t -- frontend/test/e2e/admin/access.spec.ts --headed
//   npm run t -- backend/test/unit/line/line.spec.ts
//   npm run t
import { spawnSync } from 'node:child_process'
import { existsSync, readdirSync, statSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const frontend = join(root, 'frontend')
const backend = join(root, 'backend')
const isWin = process.platform === 'win32'

const args = process.argv.slice(2)
const targets = args.filter((a) => !a.startsWith('-'))
const flags = args.filter((a) => a.startsWith('-'))

const fail = (msg) => {
  console.error(`\x1b[31m[t] ${msg}\x1b[0m`)
  process.exit(1)
}
const log = (msg) => console.log(`\x1b[36m[t]\x1b[0m ${msg}`)

/** รันคำสั่งให้จบ แล้วคืน exit code */
function run(cmd, cmdArgs, cwd) {
  log(`${cmd} ${cmdArgs.join(' ')}   (ใน ${relative(root, cwd) || '.'})`)
  return spawnSync(cmd, cmdArgs, { cwd, stdio: 'inherit', shell: isWin }).status ?? 1
}

/** ไม่ใส่ไฟล์ = unit ทั้งสองฝั่ง */
if (targets.length === 0) {
  const codes = [run('npx', ['jest', ...flags], backend), run('npx', ['vitest', 'run', ...flags], frontend)]
  process.exit(codes.some((c) => c !== 0) ? 1 : 0)
}

/** หาไฟล์/โฟลเดอร์จริง: ลองจากที่ที่พิมพ์ → โฟลเดอร์หลัก → frontend → backend → ค้นหาชื่อไฟล์ใน test/ */
function locate(arg) {
  const base = process.env.INIT_CWD ?? process.cwd()
  for (const dir of [base, root, frontend, backend]) {
    const p = resolve(dir, arg)
    if (existsSync(p)) return p
  }
  const found = []
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      if (name === 'node_modules' || name === 'dist' || name.startsWith('.')) continue
      const p = join(dir, name)
      if (statSync(p).isDirectory()) walk(p)
      else if (p.replaceAll('\\', '/').endsWith(`/${arg.replaceAll('\\', '/')}`)) found.push(p)
    }
  }
  for (const dir of [join(frontend, 'test'), join(backend, 'test')]) if (existsSync(dir)) walk(dir)
  if (found.length > 1) {
    fail(`"${arg}" ตรงกับหลายไฟล์ — ระบุพาธให้ชัดขึ้น:\n  ${found.map((p) => relative(root, p)).join('\n  ')}`)
  }
  return found[0]
}

/** จัดไฟล์เข้ากลุ่มตามพาธ */
const groups = { e2e: [], unit: [], backend: [] }
for (const arg of targets) {
  const abs = locate(arg)
  if (!abs) fail(`ไม่พบไฟล์/โฟลเดอร์ "${arg}"`)
  const rel = relative(root, abs).replaceAll('\\', '/')
  if (rel.startsWith('frontend/test/e2e')) groups.e2e.push(relative(frontend, abs).replaceAll('\\', '/'))
  else if (rel.startsWith('frontend/test/unit')) groups.unit.push(relative(frontend, abs).replaceAll('\\', '/'))
  else if (rel.startsWith('backend/test')) groups.backend.push(relative(backend, abs).replaceAll('\\', '/'))
  else fail(`"${rel}" ไม่ได้อยู่ใน frontend/test/e2e, frontend/test/unit หรือ backend/test`)
}

const codes = []
if (groups.backend.length) codes.push(run('npx', ['jest', ...groups.backend, ...flags], backend))
if (groups.unit.length) codes.push(run('npx', ['vitest', 'run', ...groups.unit, ...flags], frontend))
if (groups.e2e.length) {
  // ไม่ระบุ --project = Chrome อย่างเดียว (webkit รันเฉพาะหน้าลูกค้า ใส่ --project=webkit เองถ้าต้องการ)
  const project = flags.some((f) => f.startsWith('--project')) ? [] : ['--project=chromium']
  codes.push(run('npm', ['run', 'test:e2e:local', '--', ...groups.e2e, ...project, ...flags], frontend))
}
process.exit(codes.some((c) => c !== 0) ? 1 : 0)
