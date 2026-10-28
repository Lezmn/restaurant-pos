#!/usr/bin/env node
/**
 * ตั้งค่าแจ้งเตือน LINE ให้ร้านจากเทอร์มินัล — ทำแบบเดียวกับหน้า /owner/line
 *   login ADMIN → ส่งข้อความทดสอบ → ผ่านแล้วค่อยบันทึก (ไม่ผ่าน = ไม่บันทึก และบอกสาเหตุ)
 *
 * วิธีใช้ (ในโฟลเดอร์ backend):  npm run line:setup
 *   ระบบจะถามทีละช่อง — รหัสผ่านกับ token พิมพ์แล้วไม่ขึ้นบนจอ
 *   จะส่งค่าผ่าน environment แทนการพิมพ์ก็ได้ (เช่นตอนติดตั้งอัตโนมัติ):
 *     POS_API_URL                  ค่าเริ่มต้น http://localhost:3000
 *     POS_ADMIN_USER               ชื่อผู้ใช้ ADMIN (ไม่มี @ จะเติม @restaurant.local ให้)
 *     POS_ADMIN_PASSWORD
 *     LINE_CHANNEL_ACCESS_TOKEN    จาก LINE Developers → Messaging API → Channel access token (long-lived)
 *     LINE_TO                      "Your user ID" จากแท็บ Basic settings (ขึ้นต้นด้วย U)
 *
 * ไม่รับรหัสผ่าน/token ทาง argument เพราะจะค้างอยู่ใน history ของเทอร์มินัล และสคริปต์ไม่พิมพ์ token ออกจอเลย
 * ไม่ต้องใช้ Channel secret — ระบบแค่ส่งข้อความออก ไม่ได้รับ webhook
 */
import { createInterface } from 'node:readline';

const API_URL = (process.env.POS_API_URL || 'http://localhost:3000').replace(/\/+$/, '');
const LOGIN_EMAIL_DOMAIN = process.env.POS_LOGIN_EMAIL_DOMAIN || 'restaurant.local';
const LINE_TARGET = /^[UCR][0-9a-f]{32}$/;

/** ถามจากเทอร์มินัล — hidden = ไม่แสดงสิ่งที่พิมพ์ (รหัสผ่าน/token) */
function ask(question, { hidden = false } = {}) {
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    if (hidden) {
      // เขียนแค่คำถาม แล้วกลืนตัวอักษรที่พิมพ์ไม่ให้ขึ้นจอ
      rl._writeToOutput = (text) => {
        if (text.includes(question)) rl.output.write(text);
      };
    }
    rl.question(question, (answer) => {
      rl.close();
      if (hidden) process.stdout.write('\n');
      resolve(answer.trim());
    });
  });
}

async function value(envName, question, options) {
  const fromEnv = process.env[envName]?.trim();
  if (fromEnv) return fromEnv;
  if (!process.stdin.isTTY) fail(`ไม่ได้ตั้ง ${envName} และไม่มีเทอร์มินัลให้ถาม`);
  return ask(question, options);
}

function fail(message) {
  console.error(`✗ ${message}`);
  process.exit(1);
}

/** เรียก API ของร้าน — คืน body ที่ parse แล้ว หรือหยุดพร้อมข้อความจาก backend */
async function call(method, path, { token, body } = {}) {
  let res;
  try {
    res = await fetch(`${API_URL}${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    fail(`ต่อ API ที่ ${API_URL} ไม่ได้ — เปิด backend อยู่หรือเปล่า (ตั้ง POS_API_URL ถ้าอยู่ที่อื่น)`);
  }
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const message = Array.isArray(data?.message) ? data.message.join(' / ') : data?.message;
    if (res.status === 429) fail('login ถี่เกินไป (จำกัด 5 ครั้งต่อนาที) — รอสักครู่แล้วลองใหม่');
    fail(message || `${method} ${path} ได้ ${res.status}`);
  }
  return data;
}

async function main() {
  console.log(`ตั้งค่าแจ้งเตือน LINE → ${API_URL}\n`);

  const user = await value('POS_ADMIN_USER', 'ชื่อผู้ใช้ ADMIN: ');
  const password = await value('POS_ADMIN_PASSWORD', 'รหัสผ่าน: ', { hidden: true });
  const lineToken = await value('LINE_CHANNEL_ACCESS_TOKEN', 'Channel access token (long-lived): ', { hidden: true });
  const to = await value('LINE_TO', 'Your user ID (ขึ้นต้นด้วย U): ');

  // เช็กรูปแบบก่อน จะได้ไม่เปลือง login ไปเปล่า ๆ
  if (lineToken.length < 20) fail('Channel access token สั้นผิดปกติ — ก๊อปมาทั้งหมดหรือยัง');
  if (!LINE_TARGET.test(to)) fail('User ID ต้องขึ้นต้นด้วย U ตามด้วยตัวอักษร/ตัวเลข 32 ตัว (ก๊อปจาก "Your user ID")');

  const email = user.includes('@') ? user : `${user}@${LOGIN_EMAIL_DOMAIN}`;
  const login = await call('POST', '/auth/login', { body: { email, password } });
  if (login.user?.role !== 'ADMIN') fail(`บัญชี ${email} ไม่ใช่ ADMIN — ตั้งค่า LINE ได้เฉพาะเจ้าของร้าน`);
  console.log(`✓ login เป็น ${login.user.name}`);

  const test = await call('POST', '/settings/line/test', { token: login.accessToken, body: { token: lineToken, to } });
  if (!test.ok) fail(`ส่งข้อความทดสอบไม่สำเร็จ: ${test.message}\n  (ยังไม่ได้บันทึกอะไร)`);
  console.log('✓ ส่งข้อความทดสอบแล้ว — เช็คใน LINE');

  const saved = await call('PUT', '/settings/line', {
    token: login.accessToken,
    body: { enabled: true, to, token: lineToken },
  });
  console.log(`✓ บันทึกแล้ว: ส่งถึง ${saved.to} · token ${saved.tokenHint} · ${saved.ready ? 'พร้อมส่ง' : 'ยังไม่พร้อม'}`);
  console.log('\nต่อไปจะได้สรุปยอดเข้า LINE ทุกครั้งที่กด "ปิดยอดวันนี้"');
}

main();
