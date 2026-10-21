import { defineConfig, mergeConfig } from 'vitest/config'
import viteConfig from './vite.config.ts'

// unit/component test เท่านั้น — E2E ของ Playwright อยู่ที่ test/ แยกกัน ห้ามให้ vitest ไปกิน
export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      environment: 'jsdom',
      include: ['src/**/*.test.{ts,tsx}'],
      exclude: ['test/**', 'node_modules/**', 'dist/**'],
      setupFiles: ['./src/test/setup.ts'],
      env: { TZ: 'Asia/Bangkok' },
      restoreMocks: true,
    },
  }),
)
