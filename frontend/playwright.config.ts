import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './test',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: 'html',
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'on-first-retry',
    // หน่วงระหว่างแต่ละ action (ms) ให้ดูทันตอนรันแบบ --headed
    // ไม่กระทบตอนรันแบบ headless/CI เพราะเห็นผลแค่ตอนมี browser window จริง
    launchOptions: {
      slowMo: 1000,
    },
  },
  projects: [
    // channel: 'chrome' ใช้ Google Chrome ที่ติดตั้งไว้ในเครื่องอยู่แล้ว
    // แทนที่จะดาวน์โหลด Chromium ของ Playwright เอง (กันปัญหาโดน firewall บล็อก cdn.playwright.dev)
    { name: 'chromium', use: { ...devices['Desktop Chrome'], channel: 'chrome' } },
  ],
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:5173',
    reuseExistingServer: !process.env.CI,
  },
})
