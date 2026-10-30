import 'dotenv/config';
import { PrismaClient, Role } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { randomBytes } from 'crypto';

/**
 * กู้บัญชี ADMIN เมื่อไม่มี ADMIN คนไหน login ได้ (ลืมรหัส / ADMIN คนเดียวถูกปิดใช้งาน)
 * ไม่มีหน้า "ลืมรหัสผ่าน" ในแอป — คนที่รันสคริปต์นี้ได้ต้องเข้าถึงเซิร์ฟเวอร์ + DATABASE_URL อยู่แล้ว
 *
 *   - ตั้งรหัสชั่วคราวแบบสุ่ม (แสดงครั้งเดียวบนจอ) + บังคับตั้งรหัสใหม่ตอน login
 *   - tokenVersion + 1 → ทุกเครื่องที่ login บัญชีนี้ค้างไว้หลุดทันที
 *   - บัญชีที่ถูกปิดใช้งานจะถูกเปิดกลับ
 *   - รับเฉพาะบัญชี ADMIN — ครัว/หน้าร้านให้ ADMIN ตั้งรหัสให้ผ่านแอป
 *
 * ใช้: npm run admin:reset -- owner@example.com
 *      npm run admin:reset          (ไม่ใส่อีเมล = แสดงรายชื่อ ADMIN ทั้งหมด)
 */
const prisma = new PrismaClient();

async function listAdmins() {
  const admins = await prisma.user.findMany({
    where: { role: Role.ADMIN },
    select: { email: true, name: true, isActive: true },
    orderBy: { createdAt: 'asc' },
  });
  if (admins.length === 0) {
    console.log('ไม่มีบัญชี ADMIN ในระบบ — สร้างใหม่ด้วย npm run prisma:seed:prod (ถ้ายังไม่มี user เลย)');
    return;
  }
  console.log('บัญชี ADMIN ในระบบ:');
  for (const a of admins) {
    console.log(`  ${a.email}  (${a.name})${a.isActive ? '' : '  [ปิดใช้งาน]'}`);
  }
  console.log('\nรีเซ็ตด้วย: npm run admin:reset -- <email>');
}

async function main() {
  const email = process.argv[2]?.trim();
  if (!email) return listAdmins();

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) throw new Error(`ไม่พบบัญชี ${email}`);
  if (user.role !== Role.ADMIN) {
    throw new Error(`${email} ไม่ใช่ ADMIN — ให้ ADMIN ตั้งรหัสใหม่ให้ผ่านหน้าจัดการผู้ใช้ในแอป`);
  }

  // base64url 12 ตัว ≈ 72 bit — พอสำหรับรหัสที่ใช้ได้แค่ครั้งเดียวก่อนถูกบังคับเปลี่ยน
  const tempPassword = randomBytes(9).toString('base64url');

  await prisma.user.update({
    where: { id: user.id },
    data: {
      password: await bcrypt.hash(tempPassword, 12),
      mustChangePassword: true,
      isActive: true,
      tokenVersion: { increment: 1 },
    },
  });

  console.log(`รีเซ็ตรหัส ${email} แล้ว${user.isActive ? '' : ' (เปิดใช้งานบัญชีกลับแล้ว)'}`);
  console.log(`รหัสชั่วคราว: ${tempPassword}`);
  console.log('login ด้วยรหัสนี้แล้วระบบจะบังคับให้ตั้งรหัสใหม่ — เครื่องที่ login ค้างไว้ถูกออกจากระบบหมดแล้ว');
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
