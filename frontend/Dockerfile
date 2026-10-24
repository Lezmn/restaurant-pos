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
# รันเป็น user ธรรมดา ไม่ใช่ root (Sonar docker:S6471) — /usr/bin/caddy มี cap_net_bind_service มากับ image
# จึงเปิดพอร์ต 80/443 ได้โดยไม่ต้องเป็น root; /data (ใบรับรอง) กับ /config ต้องเขียนได้
RUN addgroup -S caddy && adduser -S -D -H -G caddy caddy && chown -R caddy:caddy /data /config
# ค่าเริ่มต้น: HTTP ที่ :8080 หลัง Nginx บน VPS (deploy/docker-compose.yml)
# docker-compose.prod.yml mount deploy/Caddyfile (HTTPS ในตัว) ทับไฟล์นี้
COPY Caddyfile /etc/caddy/Caddyfile
COPY --from=build /app/dist /srv
USER caddy
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://127.0.0.1:8080/ >/dev/null || exit 1
