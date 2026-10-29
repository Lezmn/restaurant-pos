import { playwright } from '@vitest/browser-playwright'
import { defineConfig, mergeConfig } from 'vitest/config'
import baseConfig from './vitest.config.ts'

// unit test ชุดเดิม แต่รันใน Chrome จริงแบบเปิดหน้าต่าง (เห็น component ขึ้นบนจอ) — npm run test:browser
// npm test / CI ยังใช้ jsdom ตาม vitest.config.ts เหมือนเดิม
// ค้างหน้าจอหลังจบแต่ละเทสต์ได้ด้วย VITEST_SLOWMO (ms) ค่าเริ่มต้น 500 — ดู test/unit/setup.browser.ts
// (slowMo ของ Playwright ใช้ไม่ได้ที่นี่ เพราะเทสต์คลิก/พิมพ์ด้วย @testing-library/user-event ซึ่งรันในหน้าเว็บเอง)
const slowMo = process.env.VITEST_SLOWMO ?? '500'

export default defineConfig((env) => {
  const config = mergeConfig(
    baseConfig(env),
    defineConfig({
      // ส่งค่าเข้าไปให้โค้ดที่รันใน Chrome อ่านผ่าน import.meta.env
      define: { 'import.meta.env.VITEST_SLOWMO': JSON.stringify(slowMo) },
      test: {
        setupFiles: ['./test/unit/setup.browser.ts'],
        browser: {
          enabled: true,
          headless: false,
          // ใช้ Chrome ที่ติดตั้งในเครื่อง เหมือน E2E (ไม่ต้องโหลด Chromium ของ Playwright)
          provider: playwright({ launchOptions: { channel: 'chrome' } }),
          instances: [{ browser: 'chromium' }],
          viewport: { width: 1280, height: 800 },
        },
      },
    }),
  )
  // เฉพาะเทสต์ที่มีหน้าจอให้ดู — lib/ กับ features/ เป็น logic ล้วน (บางตัว stub fetch/location แบบที่ใช้ได้แค่ใน jsdom)
  // ตั้งทับตรง ๆ เพราะ mergeConfig เอา array มาต่อกัน (จะได้ทุกไฟล์ของ config หลักกลับมา)
  config.test!.include = ['test/unit/pages/**/*.test.tsx', 'test/unit/components/**/*.test.tsx']
  return config
})
