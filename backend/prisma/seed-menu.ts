/**
 * เมนูตั้งต้นสำหรับร้านจริง (production) — หมวด + เมนู + ตัวเลือก + วัตถุดิบ ชุดเดียวกับ seed.ts
 * ไม่สร้างบัญชี / โต๊ะ / บิล / ข้อมูลตัวอย่างอื่น (ต่างจาก seed.ts ที่มีบัญชี demo รหัส ChangeMe123!)
 *
 * รันซ้ำได้: ของที่มีชื่อเดิมอยู่แล้วจะไม่ซ้ำ และไม่ทับราคา/รูป/สถานะที่ร้านแก้ไปแล้ว
 *   VPS:  docker compose run --rm migrate npm run prisma:seed:menu
 * จากนั้นแก้/ลบ/เพิ่มเมนูจริงที่หน้า "จัดการเมนู"
 */
import 'dotenv/config';
import { MenuOptionGroup, PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const { PROTEIN, EXTRA } = MenuOptionGroup;

/** วัตถุดิบที่ตัวเลือกผูก — ปิด "ไข่" ทีเดียว ตัวเลือกไข่ทุกเมนูหายตาม */
const INGREDIENTS = ['หมู', 'ไก่', 'หมูกรอบ', 'กุ้ง', 'ไข่'];
const CATEGORIES = ['อาหารจานเดียว', 'เมนูเส้น', 'เครื่องดื่ม', 'ของหวาน'];

interface OptionSeed {
  name: string;
  price: number;
  group: MenuOptionGroup;
  /** ไม่ระบุ = ใช้ชื่อตัวเลือก (หมู → หมู); ชื่อที่ไม่ใช่วัตถุดิบ (พิเศษ) จะไม่ผูก */
  ingredient?: string;
  /** ใช้วัตถุดิบกี่หน่วยต่อจาน (0 = ผูกไว้ให้หมดตามอย่างเดียว) */
  usageQty?: number;
}

const MENU: {
  category: string;
  name: string;
  price: number;
  imageUrl: string;
  /** วัตถุดิบหลักที่เมนูใช้เสมอ */
  ingredients?: string[];
  options: OptionSeed[];
}[] = [
  {
    category: 'อาหารจานเดียว',
    name: 'ข้าวผัดกะเพรา',
    price: 50,
    imageUrl: 'https://images.unsplash.com/photo-1627308595229-7830a5c91f9f',
    options: [
      { name: 'หมู', price: 0, group: PROTEIN },
      { name: 'ไก่', price: 0, group: PROTEIN },
      { name: 'หมูกรอบ', price: 10, group: PROTEIN },
      { name: 'กุ้ง', price: 20, group: PROTEIN },
      { name: 'ไข่ดาว', price: 10, group: EXTRA, ingredient: 'ไข่' },
      { name: 'ไข่เจียว', price: 10, group: EXTRA, ingredient: 'ไข่' },
      { name: 'พิเศษ', price: 10, group: EXTRA },
    ],
  },
  {
    category: 'อาหารจานเดียว',
    name: 'ข้าวไข่เจียว',
    price: 40,
    imageUrl: 'https://images.unsplash.com/photo-1565299624946-b28f40a0ae38',
    ingredients: ['ไข่'],
    options: [
      // ตัวเมนูตัดไข่ 1 ฟองแล้ว — "ไข่ 1 ฟอง" ไม่ตัดเพิ่ม, "ไข่ 2 ฟอง" ตัดอีก 1
      { name: 'ไข่ 1 ฟอง', price: 0, group: EXTRA, ingredient: 'ไข่', usageQty: 0 },
      { name: 'ไข่ 2 ฟอง', price: 10, group: EXTRA, ingredient: 'ไข่' },
      { name: 'หมูสับ', price: 10, group: PROTEIN },
    ],
  },
  {
    category: 'อาหารจานเดียว',
    name: 'ข้าวผัด',
    price: 50,
    imageUrl: 'https://images.unsplash.com/photo-1603133872878-684f208fb84b',
    options: [
      { name: 'หมู', price: 0, group: PROTEIN },
      { name: 'ไก่', price: 0, group: PROTEIN },
      { name: 'กุ้ง', price: 20, group: PROTEIN },
      { name: 'ไข่ดาว', price: 10, group: EXTRA, ingredient: 'ไข่' },
      { name: 'พิเศษ', price: 10, group: EXTRA },
    ],
  },
  {
    category: 'เมนูเส้น',
    name: 'ผัดซีอิ๊ว',
    price: 50,
    imageUrl: 'https://images.unsplash.com/photo-1555126634-323283e090fa',
    options: [
      { name: 'หมู', price: 0, group: PROTEIN },
      { name: 'ไก่', price: 0, group: PROTEIN },
      { name: 'กุ้ง', price: 20, group: PROTEIN },
      { name: 'พิเศษ', price: 10, group: EXTRA },
    ],
  },
  {
    category: 'เครื่องดื่ม',
    name: 'น้ำเปล่า',
    price: 10,
    imageUrl: 'https://images.unsplash.com/photo-1523362628745-0c100150b504',
    options: [],
  },
];

async function main() {
  const ingredientId = new Map<string, string>();
  for (const name of INGREDIENTS) {
    const row = await prisma.ingredient.upsert({ where: { name }, update: {}, create: { name } });
    ingredientId.set(name, row.id);
  }

  const categoryId = new Map<string, string>();
  for (const name of CATEGORIES) {
    const row = await prisma.category.upsert({ where: { name }, update: {}, create: { name } });
    categoryId.set(name, row.id);
  }

  let created = 0;
  let skipped = 0;
  for (const item of MENU) {
    const catId = categoryId.get(item.category)!;
    // มีเมนูชื่อนี้ในหมวดนี้แล้ว = ร้านอาจแก้ราคา/รูป/ตัวเลือกไปแล้ว ไม่แตะ
    const existing = await prisma.menuItem.findFirst({ where: { categoryId: catId, name: item.name } });
    if (existing) {
      skipped++;
      continue;
    }
    await prisma.menuItem.create({
      data: {
        categoryId: catId,
        name: item.name,
        price: item.price,
        imageUrl: item.imageUrl,
        isAvailable: true,
        ingredients: {
          create: (item.ingredients ?? []).map((n) => ({ ingredientId: ingredientId.get(n)! })),
        },
        options: {
          create: item.options.map((o) => ({
            name: o.name,
            price: o.price,
            group: o.group,
            isAvailable: true,
            ingredientId: ingredientId.get(o.ingredient ?? o.name) ?? null,
            usageQty: o.usageQty ?? 1,
          })),
        },
      },
    });
    created++;
  }

  console.log(
    `วัตถุดิบ ${INGREDIENTS.length} · หมวด ${CATEGORIES.length} · เมนูใหม่ ${created} (มีอยู่แล้ว ข้าม ${skipped})`,
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
