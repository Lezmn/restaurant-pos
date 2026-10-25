import { defineConfig, mergeConfig } from 'vitest/config'
import viteConfig from './vite.config.ts'

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
      },
    }),
  ),
)
