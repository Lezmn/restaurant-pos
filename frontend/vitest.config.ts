import { defineConfig, mergeConfig } from 'vitest/config'
import viteConfig from './vite.config.ts'

// Node 25+ มี localStorage ของตัวเองติดมา (ต้องตั้ง --localstorage-file ถึงจะใช้ได้) และมันบังของ jsdom
// → localStorage เป็น undefined แล้วเทสต์พังทั้งชุด จึงปิดของ Node ใน worker ที่รันเทสต์
const nodeMajor = Number(process.versions.node.split('.')[0])
const execArgv = nodeMajor >= 25 ? ['--no-experimental-webstorage'] : []

// unit/component test เท่านั้น (อยู่ที่ test/unit/) — E2E ของ Playwright อยู่ที่ test/e2e/ แยกกัน
// vite.config เป็นฟังก์ชัน (build จริงตรวจ VITE_API_URL + ใส่ CSP) จึงต้องเรียกก่อน merge
export default defineConfig((env) =>
  mergeConfig(
    viteConfig(env),
    defineConfig({
      test: {
        environment: 'jsdom',
        include: ['test/unit/**/*.test.{ts,tsx}'],
        exclude: ['node_modules/**', 'dist/**'],
        setupFiles: ['./test/unit/setup.ts'],
        env: { TZ: 'Asia/Bangkok' },
        restoreMocks: true,
        execArgv,
      },
    }),
  ),
)
