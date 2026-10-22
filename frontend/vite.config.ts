import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'node:url'
import { defineConfig, loadEnv, type Plugin } from 'vite'

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]'])

/**
 * build จริงต้องรู้ URL ของ API — ไม่ตั้งไว้ bundle จะยิง localhost:3000 แล้วใช้ไม่ได้ทั้งร้าน
 * และต้องเป็น https (ยกเว้น localhost) ไม่งั้น token/ข้อมูลบิลวิ่งผ่าน Wi-Fi ร้านแบบไม่เข้ารหัส
 */
function requireApiUrl(apiUrl: string | undefined): URL {
  if (!apiUrl) {
    throw new Error('ตั้ง VITE_API_URL ก่อน build (เช่น https://api.ร้าน.com) — ดู .env.example')
  }
  const url = new URL(apiUrl)
  if (url.protocol !== 'https:' && !LOCAL_HOSTS.has(url.hostname)) {
    throw new Error(`VITE_API_URL ต้องเป็น https:// (ได้ ${url.origin})`)
  }
  return url
}

/**
 * CSP + Referrer-Policy ใส่เป็น <meta> ตอน build — ใช้ได้กับทุกโฮสต์ ไม่ต้องพึ่ง config เซิร์ฟเวอร์
 * - script-src 'self': มี XSS หลุดมาก็รัน script จากที่อื่นไม่ได้ (token อยู่ใน localStorage)
 * - connect-src: ยิงได้แค่ API ของร้าน (REST + socket.io)
 * - img-src https: รูปเมนูเป็นลิงก์ภายนอกที่ ADMIN ใส่เอง
 * - referrer same-origin: URL หน้าลูกค้ามี token ของโต๊ะ ห้ามติดไปกับคำขอไปเว็บอื่น (รูป/ฟอนต์)
 * frame-ancestors ตั้งผ่าน meta ไม่ได้ — ดู nginx.conf.example
 */
function securityMeta(api: URL): Plugin {
  const ws = `${api.protocol === 'https:' ? 'wss:' : 'ws:'}//${api.host}`
  const csp = [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com",
    "img-src 'self' data: blob: https:",
    `connect-src 'self' ${api.origin} ${ws}`,
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join('; ')
  return {
    name: 'security-meta',
    apply: 'build',
    transformIndexHtml: () => [
      {
        tag: 'meta',
        attrs: { 'http-equiv': 'Content-Security-Policy', content: csp },
        injectTo: 'head-prepend',
      },
      { tag: 'meta', attrs: { name: 'referrer', content: 'same-origin' }, injectTo: 'head-prepend' },
    ],
  }
}

// https://vite.dev/config/
export default defineConfig(({ command, mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_')
  return {
    plugins: [
      react(),
      tailwindcss(),
      ...(command === 'build' ? [securityMeta(requireApiUrl(env.VITE_API_URL))] : []),
    ],
    // ล็อกพอร์ตไว้ ไม่ให้เด้งไป 5174 เวลามี process ค้าง
    // strictPort: true = ถ้าพอร์ตไม่ว่างให้ error ไปเลย จะได้รู้ตัว
    server: {
      port: 5173,
      strictPort: true,
    },
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url)),
      },
    },
  }
})
