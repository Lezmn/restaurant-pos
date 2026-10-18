FROM node:20-alpine

# Prisma engine ต้องการ OpenSSL — alpine ไม่มีติดตั้งมาให้ ทำให้ engine crash
RUN apk add --no-cache openssl

WORKDIR /app

# รันเป็น user "node" ที่ image มีมาให้ ไม่ใช่ root (Sonar docker:S6471)
# ถ้าหลุดออกจาก container ได้ ก็ยังไม่ได้สิทธิ์ root บนเครื่อง host
# ต้อง chown /app ก่อน เพราะ WORKDIR สร้างโฟลเดอร์ให้ root — ไม่งั้น npm install ล้ม EACCES
RUN chown node:node /app
COPY --chown=node:node package*.json ./

USER node

RUN npm install

# .dockerignore กันไม่ให้ .env / node_modules / .git ติดเข้ามา (Sonar docker:S6470)
COPY --chown=node:node . .

RUN npx prisma generate

EXPOSE 3000

CMD ["npm", "run", "start:dev"]
