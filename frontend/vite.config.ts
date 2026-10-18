import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
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
})
