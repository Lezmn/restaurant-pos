# Multi-stage — target ไหนใช้ที่ไหน
#   dev    : docker-compose.yml (dev) — ติดตั้งทุกอย่าง + start:dev (mount src เข้ามา hot reload)
#   build  : compose prod service "migrate" — มี prisma CLI / ts-node ไว้รัน migrate deploy + seed:prod
#   prod   : compose prod service "api" — เฉพาะ dist + dependencies จริง ไม่มี devDependencies/source
FROM node:22-alpine AS base
# Prisma engine ต้องการ OpenSSL — alpine ไม่มีติดตั้งมาให้ ทำให้ engine crash
RUN apk add --no-cache openssl
WORKDIR /app
# รันเป็น user "node" ที่ image มีมาให้ ไม่ใช่ root (Sonar docker:S6471)
# ต้อง chown /app ก่อน เพราะ WORKDIR สร้างโฟลเดอร์ให้ root — ไม่งั้น npm ล้ม EACCES
RUN chown node:node /app
USER node

# ---------- dev ----------
FROM base AS dev
COPY --chown=node:node package*.json ./
RUN npm install
# .dockerignore กันไม่ให้ .env / node_modules / .git ติดเข้ามา (Sonar docker:S6470)
COPY --chown=node:node . .
RUN npx prisma generate
EXPOSE 3000
CMD ["npm", "run", "start:dev"]

# ---------- build ----------
FROM base AS build
COPY --chown=node:node package*.json ./
# ci = ติดตั้งตาม lockfile เป๊ะ ๆ build ซ้ำได้ผลเดิม
RUN npm ci
COPY --chown=node:node . .
RUN npx prisma generate && npm run build

# ---------- prod ----------
FROM base AS prod
ENV NODE_ENV=production
COPY --chown=node:node package*.json ./
RUN npm ci --omit=dev && npm cache clean --force
# prisma client ที่ generate แล้ว (อยู่ใน node_modules/.prisma) + โค้ดที่ build แล้วเท่านั้น
COPY --from=build --chown=node:node /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=build --chown=node:node /app/dist ./dist
# รูปเมนูที่อัปโหลด (UPLOAD_DIR) — สร้างไว้เป็นของ node ก่อน: volume ใหม่จะได้สิทธิ์ตามโฟลเดอร์นี้ เขียนได้โดยไม่เป็น root
RUN mkdir -p /app/uploads
ENV UPLOAD_DIR=/app/uploads
EXPOSE 3000
# GET /health เช็ค DB ด้วย — compose/monitor ใช้ดูว่า API พร้อมรับงานจริงหรือยัง
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -qO- http://127.0.0.1:${PORT:-3000}/health || exit 1
# รัน node ตรง ๆ (ไม่ผ่าน npm) ให้ได้สัญญาณ SIGTERM ตอน docker stop → ปิด Prisma/socket เรียบร้อย
CMD ["node", "dist/main"]
