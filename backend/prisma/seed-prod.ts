import 'dotenv/config';
import { PrismaClient, Role } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

/**
 * Seed สำหรับติดตั้งร้านจริงครั้งแรก — ต่างจาก seed.ts (dev/demo) ตรงที่
 *   - ไม่มีเมนูตัวอย่าง / demo order / รายจ่ายปลอม — ร้านกรอกเองผ่านหน้าแอป
 *   - รหัส ADMIN มาจาก env ไม่ใช่ค่าตายตัวใน git
 *   - รันซ้ำปลอดภัย: ถ้ามี user อยู่แล้วจะไม่แตะอะไรเลย (ไม่ทับรหัสที่ร้านเปลี่ยนไปแล้ว)
 *
 * ใช้: ADMIN_EMAIL=... ADMIN_PASSWORD=... TABLE_COUNT=8 npm run prisma:seed:prod
 */
const prisma = new PrismaClient();

function requireEnv(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`ต้องตั้งค่า ${name} ก่อนรัน seed:prod`);
  return value;
}

async function main() {
  const existingUsers = await prisma.user.count();
  if (existingUsers > 0) {
    console.log(`ข้ามการสร้าง ADMIN — มี user อยู่แล้ว ${existingUsers} คน (seed:prod ไม่ทับข้อมูลเดิม)`);
  } else {
    const email = requireEnv('ADMIN_EMAIL');
    const password = requireEnv('ADMIN_PASSWORD');
    if (password.length < 8) throw new Error('ADMIN_PASSWORD ต้องยาวอย่างน้อย 8 ตัวอักษร');

    await prisma.user.create({
      data: {
        email,
        name: process.env.ADMIN_NAME ?? 'Admin',
        role: Role.ADMIN,
        password: await bcrypt.hash(password, 12),
      },
    });
    console.log(`สร้าง ADMIN ${email} แล้ว`);
  }

  const tableCount = Number(process.env.TABLE_COUNT ?? 0);
  if (tableCount > 0) {
    const existingTables = await prisma.restaurantTable.count();
    if (existingTables > 0) {
      console.log(`ข้ามการสร้างโต๊ะ — มีโต๊ะอยู่แล้ว ${existingTables} ตัว`);
    } else {
      await prisma.restaurantTable.createMany({
        data: Array.from({ length: tableCount }, (_, i) => ({ number: i + 1 })),
      });
      console.log(`สร้างโต๊ะ 1–${tableCount} แล้ว`);
    }
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
