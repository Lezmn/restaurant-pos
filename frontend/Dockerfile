# build ไฟล์ static ด้วย node แล้วเสิร์ฟด้วย Caddy (HTTPS อัตโนมัติ + reverse proxy ไป API)
# ค่า VITE_* ถูกฝังลงไฟล์ตอน build — เปลี่ยนโดเมน/เบอร์พร้อมเพย์ต้อง build ใหม่
FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
# ส่งมาจาก docker-compose.prod.yml (อ่านจาก .env ของเครื่องที่ deploy)
# VITE_API_URL ต้องเป็น https — vite.config.ts หยุด build ถ้าไม่ตั้งหรือเป็น http
ARG VITE_API_URL
ARG VITE_PROMPTPAY_ID
ARG VITE_RESTAURANT_NAME
ARG VITE_LOGIN_EMAIL_DOMAIN
ENV VITE_API_URL=$VITE_API_URL \
    VITE_PROMPTPAY_ID=$VITE_PROMPTPAY_ID \
    VITE_RESTAURANT_NAME=$VITE_RESTAURANT_NAME \
    VITE_LOGIN_EMAIL_DOMAIN=$VITE_LOGIN_EMAIL_DOMAIN
RUN npm run build

FROM caddy:2.10-alpine
# Caddyfile mount จาก deploy/Caddyfile (ดู docker-compose.prod.yml) — image นี้มีแค่ไฟล์ static
COPY --from=build /app/dist /srv
