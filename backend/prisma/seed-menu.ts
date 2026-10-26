/**
 * เมนูตั้งต้นสำหรับร้านจริง (production) — เมนูร้านอาหารตามสั่ง ~60 รายการ: หมวด + เมนู + ตัวเลือก + วัตถุดิบ
 * (5 รายการแรกตรงกับ seed.ts ที่ใช้ทดสอบ)
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
const INGREDIENTS = ['หมู', 'ไก่', 'หมูกรอบ', 'กุ้ง', 'ไข่', 'หมึก'];
const CATEGORIES = ['อาหารจานเดียว', 'เมนูเส้น', 'กับข้าว', 'ต้ม/แกง', 'ยำ', 'เครื่องดื่ม', 'ของหวาน'];

interface OptionSeed {
  name: string;
  price: number;
  group: MenuOptionGroup;
  /** ไม่ระบุ = ใช้ชื่อตัวเลือก (หมู → หมู); ชื่อที่ไม่ใช่วัตถุดิบ (พิเศษ) จะไม่ผูก */
  ingredient?: string;
  /** ใช้วัตถุดิบกี่หน่วยต่อจาน (0 = ผูกไว้ให้หมดตามอย่างเดียว) */
  usageQty?: number;
}

// ===== ชุดตัวเลือกที่ใช้ซ้ำ (ร้านตามสั่ง: เลือกเนื้อ 1 อย่าง + ท็อปปิ้ง) =====
/** เนื้อมาตรฐาน — หมู/ไก่ ราคาเดิม, หมูกรอบ/กุ้ง/หมึก บวกเพิ่ม */
const MEAT: OptionSeed[] = [
  { name: 'หมู', price: 0, group: PROTEIN },
  { name: 'ไก่', price: 0, group: PROTEIN },
  { name: 'หมูกรอบ', price: 10, group: PROTEIN },
  { name: 'กุ้ง', price: 20, group: PROTEIN },
  { name: 'หมึก', price: 20, group: PROTEIN },
];
/** เนื้อแบบมีทะเลรวม — ต้มยำ/ผัดไทย/สุกี้ */
const MEAT_SEA: OptionSeed[] = [...MEAT, { name: 'ทะเลรวม', price: 30, group: PROTEIN }];
const EGG: OptionSeed[] = [
  { name: 'ไข่ดาว', price: 10, group: EXTRA, ingredient: 'ไข่' },
  { name: 'ไข่เจียว', price: 10, group: EXTRA, ingredient: 'ไข่' },
];
const BIG: OptionSeed = { name: 'พิเศษ', price: 10, group: EXTRA };
/** จานหลักทั่วไป: เลือกเนื้อ + ไข่ดาว/ไข่เจียว + พิเศษ */
const STANDARD: OptionSeed[] = [...MEAT, ...EGG, BIG];

type MenuSeed = {
  category: string;
  name: string;
  price: number;
  /** ไม่ใส่ = ไม่มีรูป (หน้าเว็บโชว์ภาพแทน) — ร้านอัปโหลดรูปจริงได้ที่หน้า "จัดการเมนู" */
  imageUrl?: string;
  /** วัตถุดิบหลักที่เมนูใช้เสมอ */
  ingredients?: string[];
  options: OptionSeed[];
};

const MENU: MenuSeed[] = [
  // ---------- อาหารจานเดียว (ราดข้าว) ----------
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
  { category: 'อาหารจานเดียว', name: 'ข้าวผัดพริกแกง', price: 50, options: STANDARD },
  { category: 'อาหารจานเดียว', name: 'ข้าวผัดพริกเผา', price: 50, options: STANDARD },
  { category: 'อาหารจานเดียว', name: 'ข้าวผัดพริกขิง', price: 50, options: STANDARD },
  { category: 'อาหารจานเดียว', name: 'ข้าวผัดกระเทียมพริกไทย', price: 50, options: STANDARD },
  { category: 'อาหารจานเดียว', name: 'ข้าวผัดผงกะหรี่', price: 55, options: STANDARD },
  { category: 'อาหารจานเดียว', name: 'ข้าวผัดเปรี้ยวหวาน', price: 55, options: STANDARD },
  { category: 'อาหารจานเดียว', name: 'ข้าวผัดผักรวม', price: 50, options: STANDARD },
  { category: 'อาหารจานเดียว', name: 'ข้าวผัดคะน้า', price: 50, options: STANDARD },
  { category: 'อาหารจานเดียว', name: 'ข้าวผัดน้ำมันหอย', price: 50, options: STANDARD },
  { category: 'อาหารจานเดียว', name: 'ข้าวผัดต้มยำ', price: 55, options: [...MEAT_SEA, ...EGG, BIG] },
  {
    category: 'อาหารจานเดียว',
    name: 'ข้าวหมูทอดกระเทียม',
    price: 50,
    ingredients: ['หมู'],
    options: [...EGG, BIG],
  },
  {
    category: 'อาหารจานเดียว',
    name: 'ข้าวไก่ทอดกระเทียม',
    price: 50,
    ingredients: ['ไก่'],
    options: [...EGG, BIG],
  },
  {
    category: 'อาหารจานเดียว',
    name: 'ข้าวคะน้าหมูกรอบ',
    price: 60,
    ingredients: ['หมูกรอบ'],
    options: [...EGG, BIG],
  },
  {
    category: 'อาหารจานเดียว',
    name: 'ข้าวไข่ข้นกุ้ง',
    price: 60,
    ingredients: ['ไข่', 'กุ้ง'],
    options: [BIG],
  },
  {
    category: 'อาหารจานเดียว',
    name: 'ข้าวไข่เจียวหมูสับ',
    price: 45,
    ingredients: ['ไข่', 'หมู'],
    options: [{ name: 'ไข่ 2 ฟอง', price: 10, group: EXTRA, ingredient: 'ไข่' }],
  },
  { category: 'อาหารจานเดียว', name: 'ข้าวผัดปู', price: 70, options: [...EGG, BIG] },

  // ---------- เมนูเส้น ----------
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
  { category: 'เมนูเส้น', name: 'ราดหน้า', price: 50, options: [...MEAT, BIG] },
  { category: 'เมนูเส้น', name: 'ผัดไทย', price: 55, ingredients: ['ไข่'], options: [...MEAT_SEA, BIG] },
  { category: 'เมนูเส้น', name: 'ผัดขี้เมาเส้นใหญ่', price: 50, options: [...MEAT_SEA, ...EGG, BIG] },
  { category: 'เมนูเส้น', name: 'มาม่าผัดขี้เมา', price: 50, options: [...MEAT_SEA, ...EGG, BIG] },
  { category: 'เมนูเส้น', name: 'สุกี้แห้ง', price: 55, ingredients: ['ไข่'], options: [...MEAT_SEA, BIG] },
  { category: 'เมนูเส้น', name: 'สุกี้น้ำ', price: 55, ingredients: ['ไข่'], options: [...MEAT_SEA, BIG] },
  {
    category: 'เมนูเส้น',
    name: 'ก๋วยเตี๋ยวคั่วไก่',
    price: 50,
    ingredients: ['ไก่', 'ไข่'],
    options: [BIG],
  },

  // ---------- กับข้าว (สั่งแยกกินกับข้าวสวย) ----------
  {
    category: 'กับข้าว',
    name: 'ผัดผักบุ้งไฟแดง',
    price: 50,
    options: [{ name: 'ใส่หมูกรอบ', price: 20, group: EXTRA, ingredient: 'หมูกรอบ' }],
  },
  { category: 'กับข้าว', name: 'ผัดคะน้าหมูกรอบ', price: 70, ingredients: ['หมูกรอบ'], options: [] },
  { category: 'กับข้าว', name: 'ผัดผักรวมมิตร', price: 60, options: [...MEAT] },
  { category: 'กับข้าว', name: 'ผัดเปรี้ยวหวาน', price: 70, options: [...MEAT] },
  { category: 'กับข้าว', name: 'ผัดพริกแกง', price: 70, options: [...MEAT] },
  { category: 'กับข้าว', name: 'หมูทอดกระเทียม', price: 70, ingredients: ['หมู'], options: [] },
  { category: 'กับข้าว', name: 'ไข่เจียวหมูสับ', price: 50, ingredients: ['ไข่', 'หมู'], options: [] },
  { category: 'กับข้าว', name: 'ไข่ดาว', price: 10, ingredients: ['ไข่'], options: [] },
  { category: 'กับข้าว', name: 'ข้าวสวย', price: 10, options: [] },

  // ---------- ต้ม / แกง ----------
  {
    category: 'ต้ม/แกง',
    name: 'ต้มยำน้ำข้น',
    price: 80,
    options: [
      { name: 'กุ้ง', price: 0, group: PROTEIN },
      { name: 'ไก่', price: 0, group: PROTEIN },
      { name: 'หมู', price: 0, group: PROTEIN },
      { name: 'ทะเลรวม', price: 20, group: PROTEIN },
    ],
  },
  {
    category: 'ต้ม/แกง',
    name: 'ต้มยำน้ำใส',
    price: 80,
    options: [
      { name: 'กุ้ง', price: 0, group: PROTEIN },
      { name: 'ไก่', price: 0, group: PROTEIN },
      { name: 'หมู', price: 0, group: PROTEIN },
      { name: 'ทะเลรวม', price: 20, group: PROTEIN },
    ],
  },
  { category: 'ต้ม/แกง', name: 'ต้มข่าไก่', price: 80, ingredients: ['ไก่'], options: [] },
  { category: 'ต้ม/แกง', name: 'แกงจืดเต้าหู้หมูสับ', price: 60, ingredients: ['หมู'], options: [] },
  { category: 'ต้ม/แกง', name: 'ต้มจืดสาหร่ายหมูสับ', price: 60, ingredients: ['หมู'], options: [] },

  // ---------- ยำ ----------
  { category: 'ยำ', name: 'ยำวุ้นเส้น', price: 70, options: [...MEAT_SEA] },
  { category: 'ยำ', name: 'ยำมาม่า', price: 60, options: [...MEAT_SEA] },
  { category: 'ยำ', name: 'ยำไข่ดาว', price: 50, ingredients: ['ไข่'], options: [] },

  // ---------- เครื่องดื่ม ----------
  {
    category: 'เครื่องดื่ม',
    name: 'น้ำเปล่า',
    price: 10,
    imageUrl: 'https://images.unsplash.com/photo-1523362628745-0c100150b504',
    options: [],
  },
  { category: 'เครื่องดื่ม', name: 'น้ำแข็งเปล่า', price: 5, options: [] },
  { category: 'เครื่องดื่ม', name: 'โค้ก', price: 20, options: [] },
  { category: 'เครื่องดื่ม', name: 'สไปรท์', price: 20, options: [] },
  { category: 'เครื่องดื่ม', name: 'โซดา', price: 15, options: [] },
  { category: 'เครื่องดื่ม', name: 'ชาเย็น', price: 35, options: [] },
  { category: 'เครื่องดื่ม', name: 'ชามะนาว', price: 35, options: [] },
  { category: 'เครื่องดื่ม', name: 'กาแฟเย็น', price: 40, options: [] },
  { category: 'เครื่องดื่ม', name: 'น้ำมะนาวโซดา', price: 35, options: [] },

  // ---------- ของหวาน ----------
  { category: 'ของหวาน', name: 'ข้าวเหนียวมะม่วง', price: 60, options: [] },
  { category: 'ของหวาน', name: 'กล้วยบวชชี', price: 30, options: [] },
  { category: 'ของหวาน', name: 'บัวลอยไข่หวาน', price: 35, ingredients: ['ไข่'], options: [] },
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
        imageUrl: item.imageUrl ?? null,
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
