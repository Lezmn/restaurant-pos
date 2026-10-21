import { defineConfig, devices } from '@playwright/test'

// ค่าเริ่มต้นเหมือนเดิม (เว็บ 5173 / API 3000) — override ได้ด้วย env เวลาต้องรันชุดทดสอบ
// แยกจาก dev server ที่เปิดค้างอยู่ เช่น E2E_BASE_URL=http://localhost:5273 E2E_API_URL=http://localhost:3100
const BASE_URL = process.env.E2E_BASE_URL ?? 'http://localhost:5173'
const SLOW_MO = Number(process.env.E2E_SLOWMO ?? 1000)

export default defineConfig({
  testDir: './test',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: 'html',
  use: {
    baseURL: BASE_URL,
    trace: process.env.E2E_TRACE === 'on' ? 'retain-on-failure' : 'on-first-retry',
    screenshot: 'only-on-failure',
    // หน่วงระหว่างแต่ละ action (ms) ให้ดูทันตอนรันแบบ --headed
    // ไม่กระทบตอนรันแบบ headless/CI เพราะเห็นผลแค่ตอนมี browser window จริง
    launchOptions: {
      slowMo: SLOW_MO,
    },
  },
  projects: [
    // channel: 'chrome' ใช้ Google Chrome ที่ติดตั้งไว้ในเครื่องอยู่แล้ว
    // แทนที่จะดาวน์โหลด Chromium ของ Playwright เอง (กันปัญหาโดน firewall บล็อก cdn.playwright.dev)
    { name: 'chromium', use: { ...devices['Desktop Chrome'], channel: 'chrome' } },
  ],
  webServer: {
    command: 'npm run dev',
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
  },
})
