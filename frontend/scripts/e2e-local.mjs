// รัน E2E บนเครื่องด้วยคำสั่งเดียว: npm run test:e2e:local [-- ตัวเลือกของ playwright]
//   1. เปิด container ฐานข้อมูลทดสอบ แล้วรอจนพร้อม
//   2. ลง migration ที่ยังไม่ได้ลง (prisma migrate deploy — เพิ่มอย่างเดียว ไม่ลบข้อมูล) + build backend
//   3. เปิด API ทดสอบ :3100 (login ได้ไม่จำกัด, SlipOK จำลอง) และหน้าเว็บ :5273 ที่ชี้ไป API นั้น
//   4. รัน playwright แล้วปิด server ที่สคริปต์นี้เปิดเองเมื่อจบ (ตัวที่เปิดค้างไว้อยู่แล้วจะใช้ต่อ ไม่ปิดให้)
// ไม่แตะ API ตัวจริงบน :3000 — ตัวนั้นจำกัด login 5 ครั้ง E2E จะโดน 429
//
// ตัวอย่าง:
//   npm run test:e2e:local
//   npm run test:e2e:local -- test/e2e/customer/order-status.spec.ts
//   npm run test:e2e:local -- --headed --workers=1 --project=chromium
//   npm run test:e2e:local -- -g "เมนูขายดี"
import { spawn, spawnSync } from 'node:child_process'
import { createWriteStream } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const frontend = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const backend = resolve(frontend, '../backend')
const isWin = process.platform === 'win32'

const DB_CONTAINER = process.env.E2E_DB_CONTAINER ?? 'restaurant_postgres_dev'
const API_PORT = Number(process.env.E2E_API_PORT ?? 3100)
const WEB_PORT = Number(process.env.E2E_WEB_PORT ?? 5273)
const API_URL = `http://localhost:${API_PORT}`
const WEB_URL = `http://localhost:${WEB_PORT}`

const args = process.argv.slice(2)
const started = []

const log = (msg) => console.log(`\x1b[36m[e2e-local]\x1b[0m ${msg}`)
const fail = (msg) => {
  console.error(`\x1b[31m[e2e-local] ${msg}\x1b[0m`)
  stopAll()
  process.exit(1)
}

/** รันคำสั่งให้จบ — พังเมื่อ exit code ไม่ใช่ 0 */
function run(cmd, cmdArgs, cwd, what) {
  const res = spawnSync(cmd, cmdArgs, { cwd, stdio: 'inherit', shell: isWin })
  if (res.status !== 0) fail(`${what} ไม่สำเร็จ (exit ${res.status})`)
}

async function isUp(url) {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(2000) })
    return res.ok
  } catch {
    return false
  }
}

async function waitUntilUp(url, what, child, logFile, seconds = 90) {
  for (let i = 0; i < seconds; i++) {
    if (await isUp(url)) return
    if (child && child.exitCode !== null) fail(`${what} ปิดตัวเองไปก่อน (exit ${child.exitCode}) — ดู log: ${logFile}`)
    await new Promise((r) => setTimeout(r, 1000))
  }
  fail(`${what} ไม่ตอบที่ ${url} ภายใน ${seconds} วิ — ดู log: ${logFile}`)
}

/** เปิด server เบื้องหลัง เก็บ log ลงไฟล์ (ไม่ปนกับผลเทสต์) */
function startServer(name, cmdArgs, cwd, env) {
  const logFile = join(tmpdir(), `e2e-local-${name}.log`)
  const out = createWriteStream(logFile)
  const child = spawn(process.execPath, cmdArgs, {
    cwd,
    env: { ...process.env, ...env },
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: !isWin, // ให้ปิดทั้งกลุ่ม process ได้บน mac/linux
  })
  child.stdout.pipe(out)
  child.stderr.pipe(out)
  started.push(child)
  return { child, logFile }
}

function stopAll() {
  for (const child of started.splice(0)) {
    if (child.exitCode !== null) continue
    if (isWin) spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' })
    else {
      try {
        process.kill(-child.pid, 'SIGTERM')
      } catch {
        /* ปิดไปแล้ว */
      }
    }
  }
}

process.on('SIGINT', () => {
  stopAll()
  process.exit(130)
})

// 1. ฐานข้อมูล
log(`เปิดฐานข้อมูล ${DB_CONTAINER}`)
const docker = spawnSync('docker', ['start', DB_CONTAINER], { encoding: 'utf8' })
if (docker.status !== 0) fail(`เปิด container ${DB_CONTAINER} ไม่ได้ — เปิด Docker Desktop แล้วหรือยัง?\n${docker.stderr ?? ''}`)
let dbReady = false
for (let i = 0; i < 30 && !dbReady; i++) {
  dbReady = spawnSync('docker', ['exec', DB_CONTAINER, 'pg_isready'], { stdio: 'ignore' }).status === 0
  if (!dbReady) await new Promise((r) => setTimeout(r, 1000))
}
if (!dbReady) fail('ฐานข้อมูลไม่พร้อมภายใน 30 วิ')

// 2-3. API ทดสอบ
if (await isUp(`${API_URL}/health`)) {
  log(`ใช้ API ที่เปิดอยู่แล้วที่ ${API_URL} (ไม่ build/ลง migration ใหม่)`)
} else {
  log('ลง migration ที่ยังไม่ได้ลง')
  run('npx', ['prisma', 'migrate', 'deploy'], backend, 'prisma migrate deploy')
  log('build backend')
  run('npx', ['nest', 'build'], backend, 'nest build')
  log(`เปิด API ทดสอบที่ ${API_URL}`)
  const api = startServer('api', ['dist/main'], backend, {
    PORT: String(API_PORT),
    LOGIN_THROTTLE_LIMIT: '1000',
    THROTTLE_LIMIT: '10000',
    THROTTLE_IP_LIMIT: '100000', // ทั้งชุดยิงจาก IP เดียว (ค่าเริ่มต้น 1000/นาที ไม่พอ)
    SLIPOK_MOCK: 'true',
    CORS_ORIGIN: `${WEB_URL},http://localhost:5173`,
  })
  await waitUntilUp(`${API_URL}/health`, 'API', api.child, api.logFile)
}

// 3. หน้าเว็บที่ชี้ไป API ทดสอบ
if (await isUp(WEB_URL)) {
  log(`ใช้หน้าเว็บที่เปิดอยู่แล้วที่ ${WEB_URL} — ต้องเป็นตัวที่ชี้ไป ${API_URL}`)
} else {
  log(`เปิดหน้าเว็บที่ ${WEB_URL}`)
  const web = startServer('web', ['node_modules/vite/bin/vite.js', '--port', String(WEB_PORT), '--strictPort'], frontend, {
    VITE_API_URL: API_URL,
  })
  await waitUntilUp(WEB_URL, 'หน้าเว็บ', web.child, web.logFile)
}

// 4. playwright — ไม่ได้เปิดเบราว์เซอร์ให้ดู ก็ไม่ต้องหน่วง (ค่าเริ่มต้นของ config หน่วง 1 วิต่อ action)
const watching = args.some((a) => a === '--headed' || a === '--ui' || a === '--debug')
const slowMo = process.env.E2E_SLOWMO ?? (watching ? '1000' : '0')
log(`รัน playwright ${args.join(' ')}`.trim())
const pw = spawnSync(process.execPath, ['node_modules/@playwright/test/cli.js', 'test', ...args], {
  cwd: frontend,
  stdio: 'inherit',
  env: { ...process.env, E2E_BASE_URL: WEB_URL, E2E_API_URL: API_URL, E2E_SLOWMO: slowMo },
})

stopAll()
process.exit(pw.status ?? 1)
