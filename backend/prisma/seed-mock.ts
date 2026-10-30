/**
 * ข้อมูลจำลองร้านอาหารตามสั่ง 1 ก.ย. – 30 ต.ค. 2026 ครบทุกตาราง (ไว้ดูหน้า Dashboard / รายงาน / ประวัติ / ปิดยอด)
 *
 * ⚠️ ล้างข้อมูลทุกตารางก่อน (ยกเว้นบัญชีผู้ใช้ — รหัสผ่านเดิมไม่ถูกแตะ) แล้วสร้างใหม่ทั้งหมด — ใช้กับ DB dev เท่านั้น
 *   docker exec restaurant_api npx ts-node prisma/seed-mock.ts   (API อยู่ใน docker — รูปจะถูกคัดลอกเข้า uploads ของ container)
 *   npm run prisma:seed:mock                                 (API รันบนเครื่อง)
 *   เซิร์ฟเวอร์เดโม: GitHub Actions → "Seed demo data" (สำรอง DB ก่อน แล้วรันด้วย ALLOW_MOCK_SEED + MOCK_EXISTING_USERS)
 *
 * รูปเมนู/วัตถุดิบอยู่ที่ prisma/mock-images (จาก Wikimedia Commons ดู CREDITS.md) — คัดลอกไป UPLOAD_DIR เป็น mock-<ชื่อ>.jpg
 * ลิงก์รูป = MOCK_IMAGE_BASE (ค่าเริ่มต้น http://localhost:3000) + /uploads/mock-<ชื่อ>.jpg เหมือน url ที่ได้จากการอัปโหลดจริง
 * สุ่มแบบกำหนด seed — รันซ้ำได้ตัวเลขเดิม (ยกเว้นโต๊ะที่เปิดค้างอยู่ ซึ่งอิงเวลาตอนรัน)
 */
import 'dotenv/config';
import { randomUUID } from 'crypto';
import { copyFileSync, mkdirSync, readdirSync } from 'fs';
import { join } from 'path';
import {
  BillSplitStatus,
  ExpenseCategory,
  MenuOptionGroup,
  OrderStatus,
  PaymentMethod,
  PaymentStatus,
  Prisma,
  PrismaClient,
  Role,
  ServiceRequestStatus,
  ServiceRequestType,
  SlipStatus,
  TableSessionStatus,
  TableStatus,
} from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { uploadDir } from '../src/uploads/uploads.service';

if (process.env.NODE_ENV === 'production' && process.env.ALLOW_MOCK_SEED !== 'true') {
  throw new Error('seed-mock ล้างข้อมูลทั้งหมด — ห้ามรันบน production');
}

const prisma = new PrismaClient();
const { PROTEIN, EXTRA } = MenuOptionGroup;
const { CASH, PROMPTPAY } = PaymentMethod;

const FIRST_DAY = '2026-09-01';
const LAST_DAY = '2026-10-30';
const IMAGE_BASE = (process.env.MOCK_IMAGE_BASE ?? 'http://localhost:3000').replace(/\/$/, '');
const NEW_USER_PASSWORD = 'ChangeMe123!';
/** วันที่เริ่มนับสต็อกวัตถุดิบ (ออเดอร์ก่อนหน้านี้ไม่มี stockUsed เหมือนข้อมูลจริงก่อนมีฟีเจอร์) */
const STOCK_SINCE = '2026-10-22';

// ===================== สุ่มแบบกำหนด seed =====================
let rngState = 20260901;
function rand() {
  rngState |= 0;
  rngState = (rngState + 0x6d2b79f5) | 0;
  let t = Math.imul(rngState ^ (rngState >>> 15), 1 | rngState);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const chance = (p: number) => rand() < p;
const int = (min: number, max: number) => min + Math.floor(rand() * (max - min + 1));
const pick = <T>(list: readonly T[]) => list[Math.floor(rand() * list.length)];
function weighted<T>(list: readonly (readonly [T, number])[]): T {
  const total = list.reduce((s, [, w]) => s + w, 0);
  let r = rand() * total;
  for (const [v, w] of list) if ((r -= w) < 0) return v;
  return list[list.length - 1][0];
}
function normal(mean: number, sd: number) {
  const u = 1 - rand();
  return mean + sd * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rand());
}
const hex = (len: number) => Array.from({ length: len }, () => int(0, 15).toString(16)).join('');

// ===================== เวลา (เวลาไทย) =====================
const MIN = 60_000;
/** วันที่ 'YYYY-MM-DD' + นาทีนับจากเที่ยงคืน (เวลาไทย) */
const at = (day: string, minutes: number) => new Date(new Date(`${day}T00:00:00+07:00`).getTime() + minutes * MIN);
const plus = (d: Date, minutes: number) => new Date(d.getTime() + minutes * MIN);
function days(from: string, to: string) {
  const out: string[] = [];
  for (let t = new Date(`${from}T12:00:00Z`); t <= new Date(`${to}T12:00:00Z`); t.setUTCDate(t.getUTCDate() + 1)) {
    out.push(t.toISOString().slice(0, 10));
  }
  return out;
}
const weekday = (day: string) => new Date(`${day}T12:00:00Z`).getUTCDay(); // 0 = อาทิตย์

// ===================== ข้อมูลตั้งต้นของร้าน =====================
type IngredientSeed = { name: string; image?: string; stockQty?: number; lowStockAt?: number; isAvailable?: boolean };
const INGREDIENTS: IngredientSeed[] = [
  { name: 'หมู', image: 'ing-pork' },
  { name: 'ไก่', image: 'ing-chicken' },
  { name: 'หมูกรอบ', image: 'ing-moo-krob' },
  { name: 'กุ้ง', image: 'ing-shrimp', stockQty: 24, lowStockAt: 10 },
  { name: 'ไข่', image: 'ing-egg', stockQty: 86, lowStockAt: 30 },
  { name: 'หมึก', image: 'ing-squid', stockQty: 6, lowStockAt: 8 },
  // ปูหมด — เมนูที่ใช้ปูสั่งไม่ได้จนกว่าจะเติมของ
  { name: 'ปู', stockQty: 0, lowStockAt: 3, isAvailable: false },
  { name: 'ข้าวสาร', image: 'ing-rice' },
];

const CATEGORIES = ['อาหารจานเดียว', 'เมนูเส้น', 'กับข้าว', 'ต้ม/แกง', 'ยำ/ส้มตำ', 'เครื่องดื่ม', 'ของหวาน'] as const;
type CategoryName = (typeof CATEGORIES)[number];

type OptionSeed = { name: string; price: number; group: MenuOptionGroup; ingredient?: string; usageQty?: number; weight: number };
const MEAT: OptionSeed[] = [
  { name: 'หมู', price: 0, group: PROTEIN, weight: 40 },
  { name: 'ไก่', price: 0, group: PROTEIN, weight: 25 },
  { name: 'หมูกรอบ', price: 10, group: PROTEIN, weight: 16 },
  { name: 'กุ้ง', price: 20, group: PROTEIN, weight: 12 },
  { name: 'หมึก', price: 20, group: PROTEIN, weight: 6 },
];
const MEAT_SEA: OptionSeed[] = [...MEAT, { name: 'ทะเลรวม', price: 30, group: PROTEIN, ingredient: 'กุ้ง', weight: 5 }];
/** weight ของ EXTRA = โอกาส (%) ที่ลูกค้าจะใส่ */
const EGG: OptionSeed[] = [
  { name: 'ไข่ดาว', price: 10, group: EXTRA, ingredient: 'ไข่', weight: 38 },
  { name: 'ไข่เจียว', price: 10, group: EXTRA, ingredient: 'ไข่', weight: 7 },
];
const BIG: OptionSeed = { name: 'พิเศษ', price: 10, group: EXTRA, weight: 15 };
const STANDARD = [...MEAT, ...EGG, BIG];

type MenuSeed = {
  key: string;
  category: CategoryName;
  name: string;
  price: number;
  image?: string;
  ingredients?: string[];
  proteinRequired?: boolean;
  options: OptionSeed[];
  /** ความนิยม (สัดส่วนการถูกสั่งในหมวด) */
  pop: number;
  /** ราคาก่อนวันที่ปรับราคา */
  oldPrice?: { price: number; until: string };
  /** ขายถึงวันนี้แล้วเลิกขาย (ลบแบบซ่อน) */
  deletedOn?: string;
  /** ขายได้ถึงวันนี้ หลังจากนั้นของหมด/ปิดขาย */
  soldUntil?: string;
  isAvailable?: boolean;
};

const MENU: MenuSeed[] = [
  // ---------- อาหารจานเดียว ----------
  { key: 'kaprao', category: 'อาหารจานเดียว', name: 'ข้าวผัดกะเพรา', price: 50, image: 'kaprao', options: STANDARD, pop: 30, oldPrice: { price: 45, until: '2026-09-30' } },
  {
    key: 'khai-jiao', category: 'อาหารจานเดียว', name: 'ข้าวไข่เจียว', price: 40, image: 'khai-jiao', ingredients: ['ไข่'], proteinRequired: false, pop: 10,
    options: [
      { name: 'ไข่ 2 ฟอง', price: 10, group: EXTRA, ingredient: 'ไข่', weight: 30 },
      { name: 'หมูสับ', price: 10, group: EXTRA, ingredient: 'หมู', usageQty: 0, weight: 35 },
    ],
  },
  { key: 'khao-pad', category: 'อาหารจานเดียว', name: 'ข้าวผัด', price: 50, image: 'khao-pad', options: STANDARD, pop: 12 },
  { key: 'garlic-pork', category: 'อาหารจานเดียว', name: 'ข้าวหมูทอดกระเทียม', price: 50, image: 'garlic-pork', ingredients: ['หมู'], options: [...EGG, BIG], pop: 10 },
  { key: 'khao-kana', category: 'อาหารจานเดียว', name: 'ข้าวคะน้าหมูกรอบ', price: 60, image: 'khao-kana-moo-krob', ingredients: ['หมูกรอบ'], options: [...EGG, BIG], pop: 9 },
  { key: 'priew-wan', category: 'อาหารจานเดียว', name: 'ข้าวผัดเปรี้ยวหวาน', price: 55, image: 'pad-priew-wan', options: STANDARD, pop: 6 },
  { key: 'khao-pad-poo', category: 'อาหารจานเดียว', name: 'ข้าวผัดปู', price: 70, image: 'khao-pad-poo', ingredients: ['ปู'], options: [...EGG, BIG], pop: 5, soldUntil: '2026-10-27' },
  // เลิกขายกลางเดือน ต.ค. — ประวัติออเดอร์เดือน ก.ย. ยังมีชื่อเมนูนี้
  { key: 'prik-gaeng', category: 'อาหารจานเดียว', name: 'ข้าวผัดพริกแกง', price: 50, options: STANDARD, pop: 4, deletedOn: '2026-10-15' },

  // ---------- เมนูเส้น ----------
  { key: 'see-ew', category: 'เมนูเส้น', name: 'ผัดซีอิ๊ว', price: 50, image: 'pad-see-ew', options: [...MEAT, ...EGG, BIG], pop: 9 },
  { key: 'rad-na', category: 'เมนูเส้น', name: 'ราดหน้า', price: 50, image: 'rad-na', options: [...MEAT, BIG], pop: 7 },
  { key: 'pad-thai', category: 'เมนูเส้น', name: 'ผัดไทย', price: 55, image: 'pad-thai', ingredients: ['ไข่'], options: [...MEAT_SEA, BIG], pop: 10 },
  { key: 'kee-mao', category: 'เมนูเส้น', name: 'ผัดขี้เมาเส้นใหญ่', price: 50, image: 'pad-kee-mao', options: [...MEAT_SEA, ...EGG, BIG], pop: 6 },
  { key: 'kua-gai', category: 'เมนูเส้น', name: 'ก๋วยเตี๋ยวคั่วไก่', price: 50, image: 'kua-gai', ingredients: ['ไก่', 'ไข่'], options: [BIG], pop: 4 },

  // ---------- กับข้าว ----------
  {
    key: 'pak-boong', category: 'กับข้าว', name: 'ผัดผักบุ้งไฟแดง', price: 50, image: 'pak-boong', pop: 10,
    options: [{ name: 'ใส่หมูกรอบ', price: 20, group: EXTRA, ingredient: 'หมูกรอบ', weight: 25 }],
  },
  { key: 'pak-ruam', category: 'กับข้าว', name: 'ผัดผักรวมมิตร', price: 60, image: 'pad-pak-ruam', options: [...MEAT], pop: 6 },
  { key: 'kana-krob', category: 'กับข้าว', name: 'ผัดคะน้าหมูกรอบ', price: 70, image: 'kana-moo-krob', ingredients: ['หมูกรอบ'], options: [], pop: 7 },
  { key: 'jiao-moo-sab', category: 'กับข้าว', name: 'ไข่เจียวหมูสับ', price: 50, image: 'khai-jiao-moo-sab', ingredients: ['ไข่', 'หมู'], options: [], pop: 8 },
  { key: 'khai-dao', category: 'กับข้าว', name: 'ไข่ดาว', price: 10, image: 'khai-dao', ingredients: ['ไข่'], options: [], pop: 4 },
  { key: 'poo-karee', category: 'กับข้าว', name: 'ปูผัดผงกะหรี่', price: 180, image: 'poo-pad-pong-karee', ingredients: ['ปู', 'ไข่'], options: [], pop: 2, soldUntil: '2026-10-27' },
  { key: 'rice', category: 'กับข้าว', name: 'ข้าวสวย', price: 10, image: 'khao-suay', ingredients: ['ข้าวสาร'], options: [], pop: 0 },

  // ---------- ต้ม / แกง ----------
  {
    key: 'tom-yum', category: 'ต้ม/แกง', name: 'ต้มยำกุ้ง', price: 120, image: 'tom-yum-kung', ingredients: ['กุ้ง'], pop: 10,
    options: [
      { name: 'น้ำข้น', price: 0, group: EXTRA, weight: 60 },
      { name: 'เพิ่มกุ้ง', price: 40, group: EXTRA, ingredient: 'กุ้ง', weight: 8 },
    ],
  },
  { key: 'tom-kha', category: 'ต้ม/แกง', name: 'ต้มข่าไก่', price: 90, image: 'tom-kha-gai', ingredients: ['ไก่'], options: [], pop: 6 },
  { key: 'gaeng-jued', category: 'ต้ม/แกง', name: 'แกงจืดเต้าหู้หมูสับ', price: 60, image: 'gaeng-jued', ingredients: ['หมู'], options: [], pop: 7 },
  { key: 'green-curry', category: 'ต้ม/แกง', name: 'แกงเขียวหวานไก่', price: 70, image: 'green-curry', ingredients: ['ไก่'], options: [], pop: 6 },

  // ---------- ยำ / ส้มตำ ----------
  { key: 'yum-woon-sen', category: 'ยำ/ส้มตำ', name: 'ยำวุ้นเส้น', price: 70, image: 'yum-woon-sen', options: [...MEAT_SEA], pop: 6 },
  { key: 'yum-khai-dao', category: 'ยำ/ส้มตำ', name: 'ยำไข่ดาว', price: 50, image: 'yum-khai-dao', ingredients: ['ไข่'], options: [], pop: 6 },
  {
    key: 'som-tam', category: 'ยำ/ส้มตำ', name: 'ส้มตำไทย', price: 45, image: 'som-tam', pop: 9,
    options: [{ name: 'ไข่เค็ม', price: 15, group: EXTRA, weight: 20 }],
  },
  { key: 'larb', category: 'ยำ/ส้มตำ', name: 'ลาบหมู', price: 60, image: 'larb-moo', ingredients: ['หมู'], options: [], pop: 6 },

  // ---------- เครื่องดื่ม ----------
  { key: 'water', category: 'เครื่องดื่ม', name: 'น้ำเปล่า', price: 10, image: 'water', options: [], pop: 30 },
  { key: 'cha-yen', category: 'เครื่องดื่ม', name: 'ชาเย็น', price: 35, image: 'cha-yen', options: [], pop: 18 },
  { key: 'cha-manao', category: 'เครื่องดื่ม', name: 'ชามะนาว', price: 30, image: 'cha-manao', options: [], pop: 12 },
  { key: 'kafae', category: 'เครื่องดื่ม', name: 'กาแฟเย็น', price: 40, image: 'kafae-yen', options: [], pop: 10 },
  { key: 'red-soda', category: 'เครื่องดื่ม', name: 'น้ำแดงโซดา', price: 25, image: 'red-soda', options: [], pop: 10 },
  { key: 'soda', category: 'เครื่องดื่ม', name: 'โซดา', price: 15, image: 'soda', options: [], pop: 6 },

  // ---------- ของหวาน ----------
  { key: 'mango', category: 'ของหวาน', name: 'ข้าวเหนียวมะม่วง', price: 70, image: 'mango-sticky', options: [], pop: 10 },
  { key: 'kluay', category: 'ของหวาน', name: 'กล้วยบวชชี', price: 30, image: 'kluay-buad-chee', options: [], pop: 5 },
  { key: 'bua-loy', category: 'ของหวาน', name: 'บัวลอยไข่หวาน', price: 35, image: 'bua-loy', ingredients: ['ไข่'], options: [], pop: 6 },
  { key: 'tub-tim', category: 'ของหวาน', name: 'ทับทิมกรอบ', price: 35, image: 'tub-tim-grob', options: [], pop: 6, soldUntil: '2026-10-28', isAvailable: false },
];

/** โต๊ะจริง 1-10 + โต๊ะ 11 ที่ยกออกตั้งแต่ 1 ต.ค. (ปิดใช้งาน แต่มีประวัติขายเดือน ก.ย.) */
const TABLES = [
  { number: 1, seats: 2 }, { number: 2, seats: 2 }, { number: 3, seats: 4 }, { number: 4, seats: 4 },
  { number: 5, seats: 4 }, { number: 6, seats: 4 }, { number: 7, seats: 4 }, { number: 8, seats: 6 },
  { number: 9, seats: 6 }, { number: 10, seats: 8 }, { number: 11, seats: 4, removedOn: '2026-10-01' },
];

const NOTES = ['ไม่เผ็ด', 'เผ็ดน้อย', 'เผ็ดมาก', 'ไม่ใส่ผัก', 'ไม่ใส่ต้นหอม', 'ไข่ดาวไม่สุก', 'ไข่ดาวสุก ๆ', 'แยกข้าว', 'ไม่ใส่ผงชูรส'];
const TAKEAWAY_NOTES = ['ใส่กล่อง', 'แยกน้ำแกง', 'ขอช้อนส้อม', 'ไม่เผ็ด', 'แยกไข่'];
const CUSTOMERS = ['คุณต้น', 'พี่แอน', 'คุณมาย', 'น้องบีม', 'คุณป้าสมศรี', 'พี่หนึ่ง (ร้านซ่อมรถ)', 'คุณเจ', 'ช่างโอ๊ต', 'ฝน', 'คุณวิทย์', 'พี่ตุ๋ย', 'ออฟฟิศชั้น 3'];
const CUSTOM_ITEMS = [
  { name: 'ข้าวเพิ่ม', price: 10 },
  { name: 'ไข่ต้ม', price: 10 },
  { name: 'น้ำแข็งเพิ่ม', price: 5 },
  { name: 'ค่ากล่องกลับบ้าน', price: 5 },
];
const BANKS = [['004', 40], ['014', 25], ['006', 15], ['002', 10], ['025', 7], ['030', 3]] as const;

// ===================== ตัวเก็บแถวก่อนบันทึกลง DB =====================
const rows = {
  sessions: [] as Prisma.TableSessionCreateManyInput[],
  orders: [] as Prisma.OrderCreateManyInput[],
  orderItems: [] as Prisma.OrderItemCreateManyInput[],
  orderItemOptions: [] as Prisma.OrderItemOptionCreateManyInput[],
  payments: [] as Prisma.PaymentCreateManyInput[],
  billSplits: [] as Prisma.BillSplitCreateManyInput[],
  receipts: [] as (Prisma.ReceiptCreateManyInput & { _table: number })[],
  receiptItems: [] as Prisma.ReceiptItemCreateManyInput[],
  serviceRequests: [] as Prisma.ServiceRequestCreateManyInput[],
  expenses: [] as Prisma.ExpenseCreateManyInput[],
  cashCloses: [] as Prisma.DailyCashCloseCreateManyInput[],
  audits: [] as Prisma.AuditLogCreateManyInput[],
};

type Actor = { id: string; name: string; role: Role; device: { name: string; id: string; ua: string; ip: string } };
/** audit ที่ต้องรู้เลขใบเสร็จ — เลขออกตอนท้าย (เรียงตามเวลาจ่ายทั้งวัน) จึงเติมทีหลัง */
const auditNeedsReceipt: { audit: Prisma.AuditLogCreateManyInput; paymentId: string }[] = [];

function audit(actor: Actor, action: string, createdAt: Date, details: Record<string, unknown>, targetId?: string, receiptOf?: string) {
  const row: Prisma.AuditLogCreateManyInput = {
    id: randomUUID(),
    action,
    targetId: targetId ?? null,
    details: details as Prisma.InputJsonValue,
    userId: actor.id,
    userName: actor.name,
    userRole: actor.role,
    deviceName: actor.device.name,
    deviceId: actor.device.id,
    ip: actor.device.ip,
    userAgent: actor.device.ua,
    createdAt,
  };
  rows.audits.push(row);
  if (receiptOf) auditNeedsReceipt.push({ audit: row, paymentId: receiptOf });
}

/**
 * true = ไม่สร้าง/แก้บัญชี ใช้บัญชีที่มีอยู่เป็นคนทำรายการแทน — สำหรับเซิร์ฟเวอร์เดโมที่เปิดสู่อินเทอร์เน็ต
 * (บัญชี demo รหัส ChangeMe123! ใครก็เดาได้)
 */
const EXISTING_USERS = process.env.MOCK_EXISTING_USERS === 'true';

async function upsertUser(email: string, name: string, role: Role, createdAt: Date, isActive = true) {
  // บัญชีที่มีอยู่แล้วคงรหัสผ่านเดิม — แก้แค่ชื่อ/ตำแหน่ง
  return prisma.user.upsert({
    where: { email },
    update: { name, role, isActive, createdAt },
    create: { email, name, role, isActive, password: await bcrypt.hash(NEW_USER_PASSWORD, 12), createdAt },
  });
}

/** [เจ้าของ, หน้าร้าน, ครัว, กะเย็น, พาร์ทไทม์] จากบัญชีที่มีอยู่ — ตำแหน่งที่ไม่มีบัญชีใช้ ADMIN แทน */
async function existingUsers() {
  const users = await prisma.user.findMany({ where: { isActive: true }, orderBy: { createdAt: 'asc' } });
  const admin = users.find((u) => u.role === Role.ADMIN);
  if (!admin) throw new Error('ไม่มีบัญชี ADMIN — สร้างด้วย prisma:seed:prod ก่อน');
  const staff = users.find((u) => u.role === Role.STAFF) ?? admin;
  const kitchen = users.find((u) => u.role === Role.KITCHEN) ?? admin;
  return [admin, staff, kitchen, staff, staff] as const;
}

async function main() {
  // ---------- ล้างข้อมูลเดิม (ยกเว้น users และ app_settings — ค่า LINE ที่ตั้งไว้ไม่หาย) ----------
  await prisma.$executeRawUnsafe(`
    TRUNCATE audit_logs, receipt_items, receipts, order_item_options, order_items, orders, payments, bill_splits,
      service_requests, table_sessions, daily_cash_closes, expenses, menu_item_ingredients, menu_options,
      menu_items, categories, ingredients, restaurant_tables CASCADE`);

  // ---------- รูป ----------
  const dir = uploadDir();
  mkdirSync(dir, { recursive: true });
  const imageSrc = join(__dirname, 'mock-images');
  for (const file of readdirSync(imageSrc).filter((f) => f.endsWith('.jpg'))) {
    copyFileSync(join(imageSrc, file), join(dir, `mock-${file}`));
  }
  const imageUrl = (name?: string) => (name ? `${IMAGE_BASE}/uploads/mock-${name}.jpg` : null);

  // ---------- บัญชีผู้ใช้ ----------
  const devices = {
    counter: { name: 'แคชเชียร์หน้าร้าน', id: randomUUID(), ip: '192.168.1.21', ua: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0 Safari/537.36' },
    kitchen: { name: 'แท็บเล็ตครัว', id: randomUUID(), ip: '192.168.1.32', ua: 'Mozilla/5.0 (Linux; Android 14; SM-X210) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0 Safari/537.36' },
    owner: { name: 'มือถือเจ้าของ', id: randomUUID(), ip: '192.168.1.45', ua: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Mobile/15E148 Safari/604.1' },
  };
  const start = at(FIRST_DAY, 0);
  const [admin, staff, kitchen, eveningStaff, formerStaff] = EXISTING_USERS ? await existingUsers() : await Promise.all([
    upsertUser('admin@restaurant.local', 'เจ้าของร้าน', Role.ADMIN, plus(start, -30 * 24 * 60)),
    upsertUser('staff@restaurant.local', 'หน้าร้าน', Role.STAFF, plus(start, -30 * 24 * 60)),
    upsertUser('kitchen@restaurant.local', 'ครัว', Role.KITCHEN, plus(start, -30 * 24 * 60)),
    upsertUser('staff2@restaurant.local', 'หน้าร้าน (กะเย็น)', Role.STAFF, at('2026-09-14', 9 * 60 + 40)),
    upsertUser('parttime@restaurant.local', 'พาร์ทไทม์เสาร์-อาทิตย์', Role.STAFF, at('2026-09-01', 9 * 60), false),
  ]);
  const actor = (u: { id: string; name: string; role: Role }, device: Actor['device']): Actor => ({ id: u.id, name: u.name, role: u.role, device });
  const OWNER = actor(admin, devices.owner);
  const COUNTER = actor(staff, devices.counter);
  const EVENING = actor(eveningStaff, devices.counter);
  const PARTTIME = actor(formerStaff, devices.counter);
  const KITCHEN = actor(kitchen, devices.kitchen);
  const cashierAt = (day: string, minute: number) => {
    if (minute >= 16 * 60 && day >= '2026-09-14') return EVENING;
    const wd = weekday(day);
    if ((wd === 0 || wd === 6) && day < '2026-10-11' && minute >= 11 * 60 && minute < 15 * 60 && chance(0.4)) return PARTTIME;
    return COUNTER;
  };

  if (!EXISTING_USERS) {
    audit(OWNER, 'USER_CREATE', at('2026-09-01', 9 * 60), { name: formerStaff.name, role: 'STAFF', email: formerStaff.email }, formerStaff.id);
    audit(OWNER, 'USER_CREATE', at('2026-09-14', 9 * 60 + 40), { name: eveningStaff.name, role: 'STAFF', email: eveningStaff.email }, eveningStaff.id);
    audit(OWNER, 'USER_UPDATE', at('2026-10-11', 21 * 60 + 5), { before: { name: formerStaff.name, role: 'STAFF', isActive: true }, changes: { isActive: false } }, formerStaff.id);
  }
  audit(OWNER, 'SETTINGS_LINE_UPDATE', at('2026-09-02', 21 * 60 + 30), { enabled: false, to: '', tokenChanged: false });

  // ---------- วัตถุดิบ / หมวด / เมนู ----------
  const ingredientId = new Map<string, string>();
  for (const ing of INGREDIENTS) {
    const row = await prisma.ingredient.create({
      data: {
        name: ing.name,
        imageUrl: imageUrl(ing.image),
        stockQty: ing.stockQty ?? null,
        lowStockAt: ing.lowStockAt ?? null,
        isAvailable: ing.isAvailable ?? true,
        createdAt: start,
      },
    });
    ingredientId.set(ing.name, row.id);
  }
  const stocked = new Set(INGREDIENTS.filter((i) => i.stockQty !== undefined).map((i) => ingredientId.get(i.name)!));

  const categoryId = new Map<string, string>();
  for (const name of CATEGORIES) {
    categoryId.set(name, (await prisma.category.create({ data: { name } })).id);
  }

  type OptionRow = OptionSeed & { id: string; ingredientId: string | null };
  type MenuRow = MenuSeed & { id: string; optionRows: OptionRow[]; ingredientIds: string[] };
  const menu = new Map<string, MenuRow>();
  for (const item of MENU) {
    const id = randomUUID();
    const optionRows: OptionRow[] = item.options.map((o) => ({ ...o, id: randomUUID(), ingredientId: ingredientId.get(o.ingredient ?? o.name) ?? null }));
    const ingredientIds = (item.ingredients ?? []).map((n) => ingredientId.get(n)!);
    await prisma.menuItem.create({
      data: {
        id,
        categoryId: categoryId.get(item.category)!,
        name: item.name,
        price: item.price,
        imageUrl: imageUrl(item.image),
        isAvailable: item.isAvailable ?? true,
        proteinRequired: item.proteinRequired ?? true,
        deletedAt: item.deletedOn ? at(item.deletedOn, 21 * 60 + 10) : null,
        createdAt: plus(start, -7 * 24 * 60),
        ingredients: { create: ingredientIds.map((ingredientId) => ({ ingredientId })) },
        options: {
          create: optionRows.map((o) => ({
            id: o.id, name: o.name, price: o.price, group: o.group, ingredientId: o.ingredientId, usageQty: o.usageQty ?? 1,
          })),
        },
      },
    });
    menu.set(item.key, { ...item, id, optionRows, ingredientIds });
    if (item.oldPrice) {
      audit(OWNER, 'MENU_UPDATE', at(item.oldPrice.until, 21 * 60 + 20), { before: { name: item.name, price: item.oldPrice.price }, changes: { price: item.price } }, id);
    }
    if (item.deletedOn) {
      audit(OWNER, 'MENU_DELETE', at(item.deletedOn, 21 * 60 + 10), { name: item.name, price: item.price }, id);
    }
    if (item.isAvailable === false && item.soldUntil) {
      audit(OWNER, 'MENU_UPDATE', at(item.soldUntil, 20 * 60 + 45), { before: { name: item.name, isAvailable: true }, changes: { isAvailable: false } }, id);
    }
  }

  // ---------- โต๊ะ ----------
  const tableId = new Map<number, string>();
  for (const t of TABLES) {
    const row = await prisma.restaurantTable.create({ data: { number: t.number, seats: t.seats, isActive: !t.removedOn } });
    tableId.set(t.number, row.id);
  }
  const takeawayTable = await prisma.restaurantTable.create({ data: { number: 0, seats: 0, isTakeaway: true } });

  // ---------- ตัวช่วยสร้างออเดอร์ ----------
  const sellable = (m: MenuRow, day: string) =>
    !(m.deletedOn && day >= m.deletedOn) && !(m.soldUntil && day > m.soldUntil);
  const byCategory = (cats: CategoryName[], day: string) =>
    [...menu.values()].filter((m) => cats.includes(m.category) && m.pop > 0 && sellable(m, day)).map((m) => [m, m.pop] as const);

  type Line = { menu?: MenuRow; custom?: { name: string; price: number }; qty: number; options: OptionRow[]; note: string | null };
  function chooseOptions(m: MenuRow) {
    const chosen: OptionRow[] = [];
    const proteins = m.optionRows.filter((o) => o.group === PROTEIN);
    if (proteins.length && (m.proteinRequired ?? true)) chosen.push(weighted(proteins.map((o) => [o, o.weight] as const)));
    for (const o of m.optionRows.filter((o) => o.group === EXTRA)) if (chance(o.weight / 100)) chosen.push(o);
    return chosen;
  }
  function addLine(lines: Line[], m: MenuRow, qty = 1, note: string | null = null) {
    const options = chooseOptions(m);
    const same = lines.find((l) => l.menu === m && l.note === note && l.options.map((o) => o.id).join() === options.map((o) => o.id).join());
    if (same) same.qty += qty;
    else lines.push({ menu: m, qty, options, note });
  }
  const priceOn = (m: MenuRow, day: string) => (m.oldPrice && day <= m.oldPrice.until ? m.oldPrice.price : m.price);
  const lineUnit = (l: Line, day: string) => (l.menu ? priceOn(l.menu, day) : l.custom!.price);
  const lineTotal = (l: Line, day: string) => (lineUnit(l, day) + l.options.reduce((s, o) => s + o.price, 0)) * l.qty;

  /** รายการอาหารของโต๊ะ guests คน (รอบแรก) */
  function dineInLines(guests: number, day: string, takeaway = false) {
    const lines: Line[] = [];
    const sharing = guests >= 2 && chance(takeaway ? 0.15 : 0.45);
    const noteList = takeaway ? TAKEAWAY_NOTES : NOTES;
    const note = () => (chance(takeaway ? 0.25 : 0.12) ? pick(noteList) : null);
    if (sharing) {
      // สั่งกับข้าวมาแชร์กันกินกับข้าวสวย
      const dishes = Math.max(2, Math.round(guests * 0.9 + normal(0, 0.6)));
      const pool = byCategory(['กับข้าว', 'ต้ม/แกง', 'ยำ/ส้มตำ'], day);
      for (let i = 0; i < dishes; i++) addLine(lines, weighted(pool), 1, note());
      if (chance(0.5)) addLine(lines, weighted(byCategory(['อาหารจานเดียว', 'เมนูเส้น'], day)), 1, note());
      addLine(lines, menu.get('rice')!, guests + (chance(0.3) ? 1 : 0));
    } else {
      const mains = byCategory(['อาหารจานเดียว', 'เมนูเส้น'], day);
      for (let g = 0; g < guests; g++) {
        addLine(lines, weighted(mains), 1, note());
        if (chance(0.06)) addLine(lines, menu.get('khai-dao')!);
      }
      if (guests >= 3 && chance(0.4)) addLine(lines, weighted(byCategory(['ต้ม/แกง', 'ยำ/ส้มตำ'], day)));
    }
    const drinks = byCategory(['เครื่องดื่ม'], day);
    for (let g = 0; g < guests; g++) if (chance(takeaway ? 0.35 : 0.6)) addLine(lines, weighted(drinks));
    if (chance(takeaway ? 0.06 : 0.12)) addLine(lines, weighted(byCategory(['ของหวาน'], day)), guests >= 3 && chance(0.4) ? 2 : 1);
    return lines;
  }
  function moreLines(guests: number, day: string) {
    const lines: Line[] = [];
    const roll = rand();
    if (roll < 0.45) for (let i = 0; i < Math.max(1, Math.floor(guests / 2)); i++) addLine(lines, weighted(byCategory(['เครื่องดื่ม'], day)));
    else if (roll < 0.7) addLine(lines, weighted(byCategory(['ของหวาน'], day)), guests >= 3 ? 2 : 1);
    else if (roll < 0.85) addLine(lines, menu.get('rice')!, int(1, 2));
    else addLine(lines, weighted(byCategory(['อาหารจานเดียว', 'เมนูเส้น', 'กับข้าว'], day)));
    return lines;
  }

  type OrderRow = Prisma.OrderCreateManyInput & { _lines: Line[]; _day: string };
  function createOrder(o: {
    tableId: string; sessionId: string; createdAt: Date; status: OrderStatus; lines: Line[]; day: string;
    startedAt?: Date | null; servedAt?: Date | null; clearedAt?: Date | null;
  }): OrderRow {
    const id = randomUUID();
    for (const l of o.lines) {
      const itemId = randomUUID();
      let stockUsed: Record<string, number> | null = null;
      if (l.menu && o.day >= STOCK_SINCE) {
        const used: Record<string, number> = {};
        for (const ing of l.menu.ingredientIds) if (stocked.has(ing)) used[ing] = (used[ing] ?? 0) + l.qty;
        for (const opt of l.options) {
          if (opt.ingredientId && stocked.has(opt.ingredientId) && (opt.usageQty ?? 1) > 0) {
            used[opt.ingredientId] = (used[opt.ingredientId] ?? 0) + (opt.usageQty ?? 1) * l.qty;
          }
        }
        if (Object.keys(used).length) stockUsed = used;
      }
      rows.orderItems.push({
        id: itemId,
        orderId: id,
        quantity: l.qty,
        unitPrice: lineUnit(l, o.day),
        note: l.note,
        menuItemId: l.menu?.id ?? null,
        customName: l.custom?.name ?? null,
        stockUsed: stockUsed ?? Prisma.DbNull,
      });
      for (const opt of l.options) {
        rows.orderItemOptions.push({ id: randomUUID(), orderItemId: itemId, menuOptionId: opt.id, name: opt.name, price: opt.price, createdAt: o.createdAt });
      }
    }
    const row: OrderRow = {
      id,
      tableId: o.tableId,
      tableSessionId: o.sessionId,
      status: o.status,
      createdAt: o.createdAt,
      updatedAt: o.clearedAt ?? o.servedAt ?? o.startedAt ?? o.createdAt,
      startedAt: o.startedAt ?? null,
      servedAt: o.servedAt ?? null,
      clearedAt: o.clearedAt ?? null,
      _lines: o.lines,
      _day: o.day,
    };
    rows.orders.push(row);
    return row;
  }
  /** เวลาครัว: รอคิว → ปรุง → เสิร์ฟ (ช่วงคนเยอะรอนานขึ้น) */
  function kitchenTimes(createdAt: Date, busy: boolean, dishes: number) {
    const startedAt = plus(createdAt, Math.max(0.5, normal(busy ? 6 : 2.5, busy ? 2.5 : 1.2)));
    const servedAt = plus(startedAt, Math.max(2, normal(5 + dishes * 1.3, 2)));
    return { startedAt, servedAt, clearedAt: plus(servedAt, Math.max(0.3, normal(1.5, 0.8))) };
  }

  function slipFields(amount: number, paidAt: Date): Partial<Prisma.PaymentCreateManyInput> {
    const transAt = plus(paidAt, -int(1, 3));
    const ymd = paidAt.toISOString().slice(0, 10).replace(/-/g, '');
    return {
      slipStatus: SlipStatus.VERIFIED,
      slipPayload: `004600060000010103${weighted(BANKS)}0224${hex(24).toUpperCase()}5102TH9104${hex(4).toUpperCase()}`,
      slipTransRef: `${ymd}${hex(12).toUpperCase()}`,
      slipAmount: amount,
      slipTransAt: transAt,
      slipSendingBank: weighted(BANKS),
      slipMessage: 'ตรวจสลิปผ่าน',
      slipAttempts: 1,
      slipCheckedAt: plus(paidAt, 0.1),
    };
  }

  /** รับเงิน + ออกใบเสร็จ (เลขใบเสร็จเติมทีหลัง) — คืน payment id */
  function pay(p: {
    sessionId: string; tableId: string; tableNumber: number; orders: OrderRow[]; paidAt: Date; method: PaymentMethod; day: string;
    actor: Actor; discountPercent?: number | null; note?: string | null; amount?: number; split?: { id: string; part: number; parts: number };
    status?: PaymentStatus; voidedAt?: Date; voidReason?: string; slip?: Partial<Prisma.PaymentCreateManyInput>;
  }) {
    const subtotal = p.orders.reduce((s, o) => s + o._lines.reduce((t, l) => t + lineTotal(l, o._day), 0), 0);
    // เหมือน applyDiscountPercent: ลดเป็นสตางค์ แต่เงินสดปัดเป็นบาท
    const rawTotal = subtotal - (p.discountPercent ? Math.round(subtotal * p.discountPercent) / 100 : 0);
    const total = p.method === CASH ? Math.round(rawTotal) : rawTotal;
    const discount = subtotal - total;
    const amount = p.amount ?? total;
    const id = randomUUID();
    rows.payments.push({
      id,
      amount,
      method: p.method,
      status: p.status ?? PaymentStatus.COMPLETED,
      paidAt: p.paidAt,
      voidedAt: p.voidedAt ?? null,
      voidReason: p.voidReason ?? null,
      note: p.note ?? null,
      tableSessionId: p.sessionId,
      billSplitId: p.split?.id ?? null,
      splitPart: p.split?.part ?? null,
      ...(p.method === PROMPTPAY ? (p.slip ?? slipFields(amount, p.paidAt)) : {}),
    });
    const receiptId = randomUUID();
    rows.receipts.push({
      id: receiptId,
      number: '',
      subtotal,
      discount,
      discountPercent: p.discountPercent ?? null,
      splitPart: p.split?.part ?? null,
      splitParts: p.split?.parts ?? null,
      total,
      issuedAt: p.paidAt,
      note: p.note ?? null,
      paymentId: id,
      tableId: p.tableId,
      tableSessionId: p.sessionId,
      _table: p.tableNumber,
    });
    for (const o of p.orders) {
      for (const l of o._lines) {
        const optionTotal = l.options.reduce((s, x) => s + x.price, 0);
        rows.receiptItems.push({
          id: randomUUID(),
          receiptId,
          name: l.custom?.name ?? l.menu!.name,
          quantity: l.qty,
          unitPrice: lineUnit(l, o._day),
          optionTotal,
          lineTotal: lineTotal(l, o._day),
          note: l.note,
          orderId: o.id,
        });
      }
    }
    return { id, subtotal, discount, total, amount };
  }

  function linkOrders(orders: OrderRow[], paymentId: string, billSplitId?: string) {
    for (const o of orders) {
      o.paymentId = paymentId;
      o.status = OrderStatus.PAID;
      if (billSplitId) o.billSplitId = billSplitId;
    }
  }

  // ---------- จำลองการขายรายวัน ----------
  const now = new Date();
  const allDays = days(FIRST_DAY, LAST_DAY);
  const openDays: string[] = [];
  let paydayBoost = 1;
  for (const [index, day] of allDays.entries()) {
    const wd = weekday(day);
    if (wd === 1) continue; // ร้านหยุดทุกวันจันทร์
    openDays.push(day);
    const dom = Number(day.slice(8, 10));
    paydayBoost = dom >= 25 || dom <= 2 ? 1.1 : dom >= 14 && dom <= 17 ? 1.05 : 1;
    const dayFactor = (wd === 0 || wd === 6 ? 1.35 : wd === 5 ? 1.15 : 1) * (1 + 0.15 * (index / allDays.length)) * paydayBoost * (0.85 + rand() * 0.3);
    // ฝนตกหนักบางวัน (ปลายฝน ก.ย.–ต.ค.) คนนั่งร้านน้อยลง สั่งกลับบ้านมากขึ้น
    const rainy = chance(0.18);
    const dineCount = Math.round(30 * dayFactor * (rainy ? 0.7 : 1));
    const takeawayCount = Math.round(13 * dayFactor * (rainy ? 1.4 : 1));

    const arrival = () => {
      const r = rand();
      const m = r < 0.5 ? normal(12 * 60 + 15, 38) : r < 0.85 ? normal(18 * 60 + 30, 50) : 10 * 60 + rand() * 10 * 60;
      return Math.round(Math.min(20 * 60 + 25, Math.max(10 * 60, m)));
    };
    const busyAt = (m: number) => (m > 11 * 60 + 40 && m < 13 * 60) || (m > 17 * 60 + 50 && m < 19 * 60 + 30);

    // ----- นั่งทานที่ร้าน -----
    const tableFree = new Map<number, number>(); // เลขโต๊ะ → นาทีที่ว่าง
    const arrivals = Array.from({ length: dineCount }, arrival).sort((a, b) => a - b);
    for (const minute of arrivals) {
      const guests = weighted([[1, 22], [2, 36], [3, 18], [4, 15], [5, 5], [6, 3], [8, 1]] as const);
      const table = TABLES
        .filter((t) => !(t.removedOn && day >= t.removedOn) && t.seats >= guests && (tableFree.get(t.number) ?? 0) <= minute)
        .sort((a, b) => a.seats - b.seats)[0];
      if (!table) continue; // เต็มทุกโต๊ะ ลูกค้าเดินออก
      const tId = tableId.get(table.number)!;
      const sessionId = randomUUID();
      const openedAt = at(day, minute + rand());
      const busy = busyAt(minute);
      const cashier = cashierAt(day, minute);

      // QR เปิดแล้วไม่มีใครสั่ง (ลูกค้าเปลี่ยนใจ) → หมดอายุ
      if (chance(0.01)) {
        rows.sessions.push({ id: sessionId, token: hex(32), status: TableSessionStatus.EXPIRED, openedAt, closedAt: plus(openedAt, 120), expiresAt: plus(openedAt, 120), guestCount: guests, tableId: tId });
        tableFree.set(table.number, minute + 10);
        continue;
      }

      const orders: OrderRow[] = [];
      const firstAt = plus(openedAt, Math.max(1, normal(4, 2)));
      const first = dineInLines(guests, day);
      if (chance(0.03)) {
        const custom = pick(CUSTOM_ITEMS);
        const qty = custom.name === 'ข้าวเพิ่ม' ? int(1, 2) : 1;
        first.push({ custom, qty, options: [], note: null });
        audit(cashier, 'ORDER_CUSTOM_ITEM', firstAt, { customItems: [{ name: custom.name, price: custom.price, quantity: qty }], tableNumber: table.number });
      }
      const k1 = kitchenTimes(firstAt, busy, first.length);
      orders.push(createOrder({ tableId: tId, sessionId, createdAt: firstAt, status: OrderStatus.SERVED, lines: first, day, ...k1 }));
      let lastServed = k1.servedAt;

      if (chance(0.3)) {
        const moreAt = plus(k1.servedAt, Math.max(3, normal(14, 6)));
        const lines = moreLines(guests, day);
        const k2 = kitchenTimes(moreAt, busy, lines.length);
        orders.push(createOrder({ tableId: tId, sessionId, createdAt: moreAt, status: OrderStatus.SERVED, lines, day, ...k2 }));
        lastServed = k2.servedAt;
      }
      // สั่งเพิ่มแล้วยกเลิกก่อนครัวรับ (เปลี่ยนใจ / ของหมด)
      if (chance(0.025)) {
        const cancelAt = plus(k1.servedAt, Math.max(2, normal(8, 3)));
        const lines = moreLines(guests, day);
        const cancelled = createOrder({ tableId: tId, sessionId, createdAt: cancelAt, status: OrderStatus.CANCELLED, lines, day });
        cancelled.updatedAt = plus(cancelAt, int(1, 4));
        audit(cashier, 'ORDER_CANCEL', cancelled.updatedAt as Date, {
          items: lines.map((l) => ({ name: l.menu?.name ?? l.custom!.name, quantity: l.qty, unitPrice: lineUnit(l, day) })),
          tableNumber: table.number,
          previousStatus: 'PENDING',
        }, cancelled.id);
      }
      // ลบรายการที่กดผิด (ไม่อยู่ในบิล)
      if (chance(0.02)) {
        const m = weighted(byCategory(['อาหารจานเดียว', 'เมนูเส้น', 'เครื่องดื่ม'], day));
        audit(cashier, 'ORDER_ITEM_REMOVE', plus(firstAt, 1), { name: m.name, options: [], quantity: 1, unitPrice: priceOn(m, day), tableNumber: table.number }, orders[0].id);
      }

      // เรียกพนักงาน
      if (chance(0.22)) {
        const reqAt = plus(firstAt, int(2, 25));
        rows.serviceRequests.push({ id: randomUUID(), type: weighted([[ServiceRequestType.CALL_STAFF, 85], [ServiceRequestType.OTHER, 15]] as const), status: ServiceRequestStatus.RESOLVED, createdAt: reqAt, resolvedAt: plus(reqAt, Math.max(0.3, normal(1.5, 0.8))), tableId: tId, tableSessionId: sessionId });
      }

      // ----- เช็คบิล -----
      const method = weighted([[PROMPTPAY, 55], [CASH, 45]] as const);
      const paidAt = plus(lastServed, Math.max(6, normal(guests >= 3 ? 30 : 20, 8)));
      if (chance(0.62)) {
        const reqAt = plus(paidAt, -Math.max(0.5, normal(2.5, 1.2)));
        rows.serviceRequests.push({ id: randomUUID(), type: ServiceRequestType.CHECKOUT, status: ServiceRequestStatus.RESOLVED, createdAt: reqAt, resolvedAt: paidAt, paymentMethod: chance(0.9) ? method : method === CASH ? PROMPTPAY : CASH, tableId: tId, tableSessionId: sessionId });
      } else if (chance(0.03)) {
        const reqAt = plus(paidAt, -6);
        rows.serviceRequests.push({ id: randomUUID(), type: ServiceRequestType.CHECKOUT, status: ServiceRequestStatus.CANCELLED, createdAt: reqAt, resolvedAt: plus(reqAt, 2), paymentMethod: method, tableId: tId, tableSessionId: sessionId });
      }

      const payable = orders.filter((o) => o.status !== OrderStatus.CANCELLED);
      const subtotal = payable.reduce((s, o) => s + o._lines.reduce((t, l) => t + lineTotal(l, day), 0), 0);
      const closedAt = paidAt;
      const roll = rand();
      if (guests >= 3 && roll < 0.05) {
        // หารเท่ากัน
        const parts = Math.min(guests, int(2, 4));
        const splitId = randomUUID();
        const per = Math.floor(subtotal / parts);
        rows.billSplits.push({ id: splitId, parts, subtotal, discount: 0, total: subtotal, status: BillSplitStatus.DONE, createdAt: plus(paidAt, -1), tableSessionId: sessionId });
        let lastPaymentId = '';
        for (let part = 1; part <= parts; part++) {
          const amount = part === parts ? subtotal - per * (parts - 1) : per;
          const partMethod = weighted([[PROMPTPAY, 65], [CASH, 35]] as const);
          lastPaymentId = pay({ sessionId, tableId: tId, tableNumber: table.number, orders: payable, paidAt: plus(paidAt, (part - 1) * 0.7), method: partMethod, day, actor: cashier, amount, split: { id: splitId, part, parts } }).id;
        }
        linkOrders(payable, lastPaymentId, splitId);
      } else if (subtotal >= 200 && roll < 0.1) {
        // ส่วนลด
        const discountPercent = weighted([[5, 40], [10, 50], [20, 10]] as const);
        const note = pick(['ลูกค้าประจำ', 'ขอโทษที่รออาหารนาน', 'ญาติเจ้าของร้าน', 'โปรวันเกิด']);
        const p = pay({ sessionId, tableId: tId, tableNumber: table.number, orders: payable, paidAt, method, day, actor: cashier, discountPercent, note });
        linkOrders(payable, p.id);
        audit(cashier, 'PAYMENT_DISCOUNT', paidAt, { discountPercent, discount: p.discount, subtotal: p.subtotal, total: p.total, note, tableNumber: table.number }, p.id, p.id);
      } else if (roll < 0.11) {
        // กดรับเงินผิด → ยกเลิกบิลแล้วรับใหม่
        const voidReason = pick(['กดวิธีจ่ายผิด', 'ยอดเงินผิด', 'กดจ่ายผิดโต๊ะ']);
        const voidedAt = plus(paidAt, int(1, 6));
        const wrongMethod = voidReason === 'กดวิธีจ่ายผิด' ? (method === CASH ? PROMPTPAY : CASH) : method;
        const wrong = pay({ sessionId, tableId: tId, tableNumber: table.number, orders: payable, paidAt, method: wrongMethod, day, actor: cashier, status: PaymentStatus.VOIDED, voidedAt, voidReason, slip: wrongMethod === PROMPTPAY ? { slipStatus: SlipStatus.MANUAL, slipOverrideReason: 'ลูกค้าแจ้งว่าโอนแล้ว', slipOverrideByName: cashier.name, slipCheckedAt: paidAt } : undefined });
        audit(OWNER, 'PAYMENT_VOID', voidedAt, { amount: wrong.amount, method: wrongMethod, reason: voidReason, tableNumber: table.number }, wrong.id, wrong.id);
        const right = pay({ sessionId, tableId: tId, tableNumber: table.number, orders: payable, paidAt: plus(voidedAt, 1), method, day, actor: cashier });
        linkOrders(payable, right.id);
      } else if (method === PROMPTPAY && roll < 0.14) {
        // SlipOK ใช้ไม่ได้ เจ้าของยืนยันเองจากแอปธนาคาร
        const reason = pick(['ระบบตรวจสลิปใช้ไม่ได้', 'เช็คยอดในแอปธนาคารแล้ว', 'ลูกค้าโอนจากต่างธนาคาร สลิปไม่มี QR']);
        const confirmedAt = plus(paidAt, int(5, 90));
        const p = pay({ sessionId, tableId: tId, tableNumber: table.number, orders: payable, paidAt, method, day, actor: cashier, slip: { slipStatus: SlipStatus.MANUAL, slipMessage: 'ธนาคารขัดข้องชั่วคราว', slipAttempts: int(1, 3), slipCheckedAt: confirmedAt, slipOverrideReason: reason, slipOverrideByName: OWNER.name } });
        linkOrders(payable, p.id);
        audit(OWNER, 'PAYMENT_SLIP_CONFIRM', confirmedAt, { amount: p.amount, method, reason, tableNumber: table.number }, p.id, p.id);
      } else {
        const p = pay({ sessionId, tableId: tId, tableNumber: table.number, orders: payable, paidAt, method, day, actor: cashier, note: chance(0.01) ? 'ขอใบเสร็จ' : null });
        linkOrders(payable, p.id);
      }

      rows.sessions.push({ id: sessionId, token: hex(32), status: TableSessionStatus.CLOSED, openedAt, closedAt, guestCount: guests, tableId: tId });
      tableFree.set(table.number, Math.round((closedAt.getTime() - at(day, 0).getTime()) / MIN) + int(2, 6));
    }

    // ----- กลับบ้าน -----
    const takeawayArrivals = Array.from({ length: takeawayCount }, () => {
      const r = rand();
      const m = r < 0.45 ? normal(11 * 60 + 50, 35) : r < 0.85 ? normal(17 * 60 + 45, 45) : 10 * 60 + rand() * 10.5 * 60;
      return Math.round(Math.min(20 * 60 + 30, Math.max(10 * 60, m)));
    }).sort((a, b) => a - b);
    for (const [i, minute] of takeawayArrivals.entries()) {
      const sessionId = randomUUID();
      const openedAt = at(day, minute + rand());
      const cashier = cashierAt(day, minute);
      const portions = weighted([[1, 45], [2, 30], [3, 15], [4, 7], [6, 3]] as const);
      const lines = dineInLines(portions, day, true);
      if (chance(0.15)) {
        lines.push({ custom: CUSTOM_ITEMS[3], qty: 1, options: [], note: null });
        audit(cashier, 'ORDER_CUSTOM_ITEM', plus(openedAt, 0.5), { customItems: [{ name: CUSTOM_ITEMS[3].name, price: CUSTOM_ITEMS[3].price, quantity: 1 }], tableNumber: 0 });
      }
      const orderAt = plus(openedAt, Math.max(0.3, normal(1, 0.4)));
      const k = kitchenTimes(orderAt, busyAt(minute), lines.length);
      const order = createOrder({ tableId: takeawayTable.id, sessionId, createdAt: orderAt, status: OrderStatus.SERVED, lines, day, ...k });
      const prepaid = chance(0.6);
      const paidAt = prepaid ? plus(orderAt, Math.max(0.5, normal(1.2, 0.5))) : plus(k.servedAt, Math.max(0.5, normal(4, 3)));
      const method = weighted([[PROMPTPAY, 55], [CASH, 45]] as const);
      const p = pay({ sessionId, tableId: takeawayTable.id, tableNumber: 0, orders: [order], paidAt, method, day, actor: cashier });
      linkOrders([order], p.id);
      const closedAt = paidAt > k.servedAt ? paidAt : plus(k.servedAt, Math.max(1, normal(6, 4)));
      rows.sessions.push({
        id: sessionId, token: hex(32), status: TableSessionStatus.CLOSED, openedAt, closedAt, tableId: takeawayTable.id,
        isTakeaway: true, takeawayNo: i + 1, customerName: chance(0.55) ? pick(CUSTOMERS) : null,
      });
    }
  }

  // ---------- รายจ่าย ----------
  const expense = (who: Actor, title: string, amount: number, category: ExpenseCategory, spentAt: Date, paidFromDrawer = false, note: string | null = null) => {
    const id = randomUUID();
    rows.expenses.push({ id, title, amount, category, spentAt, paidFromDrawer, note, createdById: who.id, createdByName: who.name, createdAt: spentAt, updatedAt: spentAt });
    audit(who, paidFromDrawer ? 'EXPENSE_DRAWER' : 'EXPENSE_CREATE', spentAt, { title, amount, category, note, paidFromDrawer }, id);
  };
  for (const day of openDays) {
    const wd = weekday(day);
    // ตลาดเช้า (เจ้าของจ่ายเอง)
    expense(OWNER, 'ซื้อของตลาดเช้า (หมู ไก่ ผัก)', Math.round(normal(wd === 0 || wd === 6 ? 4200 : 3200, 350) / 10) * 10, ExpenseCategory.INGREDIENTS, at(day, 7 * 60 + int(0, 50)));
    if (wd === 2 || wd === 5) expense(OWNER, 'อาหารทะเล (กุ้ง หมึก ปู)', Math.round(normal(2600, 300) / 10) * 10, ExpenseCategory.INGREDIENTS, at(day, 7 * 60 + int(55, 80)));
    if (wd === 3) expense(OWNER, 'ข้าวสาร 2 กระสอบ', 1980, ExpenseCategory.INGREDIENTS, at(day, 8 * 60 + 30));
    // หยิบเงินจากลิ้นชัก
    expense(COUNTER, 'น้ำแข็ง', pick([60, 80, 100, 120]), ExpenseCategory.INGREDIENTS, at(day, 10 * 60 + int(0, 30)), true);
    if (chance(0.35)) expense(cashierAt(day, 15 * 60), pick(['ผักขาด ซื้อเพิ่ม', 'ไข่ไก่เพิ่ม 1 แผง', 'มะนาวเพิ่ม', 'พริกกับกระเทียม']), pick([45, 60, 85, 110, 135]), ExpenseCategory.INGREDIENTS, at(day, int(13 * 60, 17 * 60)), true);
    if (chance(0.12)) expense(cashierAt(day, 14 * 60), pick(['ถุงพลาสติก/กล่องโฟม', 'น้ำยาล้างจาน', 'ทิชชู่']), pick([120, 150, 180, 250]), ExpenseCategory.OTHER, at(day, int(10 * 60, 19 * 60)), true);
    if (wd === 6) expense(OWNER, 'แก๊สหุงต้ม 2 ถัง', 860, ExpenseCategory.UTILITIES, at(day, 9 * 60 + 15));
  }
  for (const month of ['2026-09', '2026-10']) {
    expense(OWNER, 'ค่าเช่าร้าน', 15000, ExpenseCategory.RENT, at(`${month}-01`, 9 * 60));
    expense(OWNER, 'ค่าไฟฟ้า', month === '2026-09' ? 4380 : 4125, ExpenseCategory.UTILITIES, at(`${month}-07`, 15 * 60), false, 'บิลเดือนก่อน');
    expense(OWNER, 'ค่าน้ำประปา', month === '2026-09' ? 640 : 595, ExpenseCategory.UTILITIES, at(`${month}-09`, 15 * 60));
    expense(OWNER, 'อินเทอร์เน็ต', 599, ExpenseCategory.UTILITIES, at(`${month}-10`, 11 * 60));
    expense(OWNER, 'เงินเดือนพนักงานหน้าร้าน', 13000, ExpenseCategory.SALARY, at(month === '2026-09' ? '2026-09-30' : '2026-10-30', 21 * 60));
    expense(OWNER, 'เงินเดือนผู้ช่วยครัว', 12000, ExpenseCategory.SALARY, at(month === '2026-09' ? '2026-09-30' : '2026-10-30', 21 * 60 + 5));
  }
  expense(OWNER, 'ค่าแรงพาร์ทไทม์ ก.ย.', 4800, ExpenseCategory.SALARY, at('2026-09-30', 21 * 60 + 10));
  expense(OWNER, 'ค่าแรงพาร์ทไทม์ ต.ค. (ถึงวันที่ 11)', 1800, ExpenseCategory.SALARY, at('2026-10-11', 21 * 60));
  expense(OWNER, 'เงินเดือนกะเย็น (ครึ่งเดือนแรก)', 6000, ExpenseCategory.SALARY, at('2026-09-30', 21 * 60 + 15));
  expense(OWNER, 'เงินเดือนกะเย็น', 12000, ExpenseCategory.SALARY, at('2026-10-30', 21 * 60 + 10));
  expense(OWNER, 'กระทะเหล็กใบใหม่', 1250, ExpenseCategory.EQUIPMENT, at('2026-09-12', 16 * 60));
  expense(OWNER, 'เครื่องพิมพ์ใบเสร็จ', 2890, ExpenseCategory.EQUIPMENT, at('2026-09-20', 10 * 60), false, 'ตัวเก่าหัวพิมพ์เสีย');
  expense(OWNER, 'ซ่อมตู้แช่', 1500, ExpenseCategory.EQUIPMENT, at('2026-10-08', 15 * 60 + 30));
  expense(OWNER, 'แท็บเล็ตครัว', 5990, ExpenseCategory.EQUIPMENT, at('2026-10-21', 14 * 60));
  expense(OWNER, 'ค่ากำจัดแมลง', 900, ExpenseCategory.OTHER, at('2026-10-05', 15 * 60));
  // แก้รายจ่ายที่พิมพ์ผิด
  const fixMe = rows.expenses.find((e) => e.title === 'ซ่อมตู้แช่')!;
  audit(OWNER, 'EXPENSE_UPDATE', at('2026-10-08', 21 * 60), { before: { title: 'ซ่อมตู้แช่', amount: 15000, category: 'EQUIPMENT' }, changes: { amount: 1500 } }, fixMe.id as string);

  // ---------- เติมเลขใบเสร็จ (เรียงตามเวลาออกใบในแต่ละวัน) ----------
  const bkkDay = (d: Date) => new Date(d.getTime() + 7 * 60 * MIN).toISOString().slice(0, 10);
  const sortedReceipts = [...rows.receipts].sort((a, b) => (a.issuedAt as Date).getTime() - (b.issuedAt as Date).getTime());
  const perDay = new Map<string, number>();
  const receiptByPayment = new Map<string, (typeof rows.receipts)[number]>();
  for (const r of sortedReceipts) {
    const d = bkkDay(r.issuedAt as Date);
    const n = (perDay.get(d) ?? 0) + 1;
    perDay.set(d, n);
    r.number = `RCPT-${d.replace(/-/g, '')}-${String(n).padStart(4, '0')}`;
    receiptByPayment.set(r.paymentId, r);
  }
  for (const { audit: a, paymentId } of auditNeedsReceipt) {
    (a.details as Record<string, unknown>).receiptNumber = receiptByPayment.get(paymentId)!.number;
  }

  // ---------- ปิดยอดเงินสดรายวัน (ยกเว้นวันนี้ ให้ลองปิดเองได้) ----------
  for (const day of openDays.filter((d) => d < LAST_DAY)) {
    const paysToday = rows.payments.filter((p) => p.status === PaymentStatus.COMPLETED && bkkDay(p.paidAt as Date) === day);
    const cashSales = paysToday.filter((p) => p.method === CASH).reduce((s, p) => s + Number(p.amount), 0);
    const promptpaySales = paysToday.filter((p) => p.method === PROMPTPAY).reduce((s, p) => s + Number(p.amount), 0);
    const drawerExpenses = rows.expenses.filter((e) => e.paidFromDrawer && bkkDay(e.spentAt as Date) === day).reduce((s, e) => s + Number(e.amount), 0);
    const openingFloat = 1000;
    const expectedCash = openingFloat + cashSales - drawerExpenses;
    const difference = weighted([[0, 78], [-20, 6], [-10, 6], [10, 4], [-50, 2], [5, 2], [-100, 1], [20, 1]] as const);
    const note = difference === 0 ? null : difference < 0 ? pick(['ทอนเงินผิด', 'หาไม่เจอ', 'น่าจะทอนเกินโต๊ะหนึ่ง']) : 'ลูกค้าไม่รับเงินทอน';
    const closer = day >= '2026-09-14' ? EVENING : COUNTER;
    const closedAt = at(day, 21 * 60 + int(5, 35));
    const id = randomUUID();
    const countedCash = expectedCash + difference;
    rows.cashCloses.push({ id, date: day, openingFloat, cashSales, drawerExpenses, expectedCash, countedCash, difference, promptpaySales, note, closedAt, closedById: closer.id, closedByName: closer.name });
    audit(closer, 'CASH_CLOSE_CREATE', closedAt, { date: day, openingFloat, cashSales, drawerExpenses, expectedCash, countedCash, difference, note }, id);
  }

  // ---------- โต๊ะที่เปิดอยู่ตอนนี้ (ให้หน้า POS / ครัว มีงานค้าง) ----------
  const live = (minutesAgo: number) => plus(now, -minutesAgo);
  const today = bkkDay(now) <= LAST_DAY ? bkkDay(now) : LAST_DAY;
  const liveTable = async (number: number, guests: number, openedMinutesAgo: number, build: (sessionId: string, tId: string) => void) => {
    const tId = tableId.get(number)!;
    const sessionId = randomUUID();
    rows.sessions.push({ id: sessionId, token: hex(32), status: TableSessionStatus.OPEN, openedAt: live(openedMinutesAgo), guestCount: guests, tableId: tId });
    build(sessionId, tId);
    await prisma.restaurantTable.update({ where: { id: tId }, data: { status: TableStatus.OCCUPIED } });
  };
  // โต๊ะ 3: กินเสร็จแล้ว ขอเช็คบิล
  await liveTable(3, 3, 40, (sessionId, tId) => {
    createOrder({ tableId: tId, sessionId, createdAt: live(37), status: OrderStatus.SERVED, lines: dineInLines(3, today), day: today, startedAt: live(34), servedAt: live(25), clearedAt: live(24) });
    rows.serviceRequests.push({ id: randomUUID(), type: ServiceRequestType.CHECKOUT, status: ServiceRequestStatus.PENDING, createdAt: live(1), paymentMethod: PROMPTPAY, tableId: tId, tableSessionId: sessionId });
  });
  // โต๊ะ 5: ได้จานแรกแล้ว สั่งเพิ่มกำลังทำ + เรียกพนักงาน
  await liveTable(5, 2, 22, (sessionId, tId) => {
    createOrder({ tableId: tId, sessionId, createdAt: live(20), status: OrderStatus.SERVED, lines: dineInLines(2, today), day: today, startedAt: live(18), servedAt: live(10) });
    createOrder({ tableId: tId, sessionId, createdAt: live(4), status: OrderStatus.PREPARING, lines: moreLines(2, today), day: today, startedAt: live(2) });
    rows.serviceRequests.push({ id: randomUUID(), type: ServiceRequestType.CALL_STAFF, status: ServiceRequestStatus.PENDING, createdAt: live(2), tableId: tId, tableSessionId: sessionId });
  });
  // โต๊ะ 8: เพิ่งสั่ง รอครัวรับ
  await liveTable(8, 5, 6, (sessionId, tId) => {
    createOrder({ tableId: tId, sessionId, createdAt: live(3), status: OrderStatus.PENDING, lines: dineInLines(5, today), day: today });
  });
  // กลับบ้าน 1 บิล จ่ายแล้ว (PromptPay รอแนบสลิป) ครัวยังทำอยู่
  {
    const sessionId = randomUUID();
    const todayTakeaways = rows.sessions.filter((s) => s.isTakeaway && bkkDay(s.openedAt as Date) === today).length;
    rows.sessions.push({ id: sessionId, token: hex(32), status: TableSessionStatus.OPEN, openedAt: live(9), tableId: takeawayTable.id, isTakeaway: true, takeawayNo: todayTakeaways + 1, customerName: 'คุณต้น' });
    const order = createOrder({ tableId: takeawayTable.id, sessionId, createdAt: live(8), status: OrderStatus.PREPARING, lines: dineInLines(2, today, true), day: today, startedAt: live(5) });
    const p = pay({ sessionId, tableId: takeawayTable.id, tableNumber: 0, orders: [order], paidAt: live(7), method: PROMPTPAY, day: today, actor: COUNTER, slip: { slipStatus: SlipStatus.AWAITING, slipAttempts: 0 } });
    order.paymentId = p.id; // จ่ายก่อน ออเดอร์ยังทำอยู่ — คงสถานะ PREPARING
    const r = rows.receipts.find((x) => x.paymentId === p.id)!;
    r.number = `RCPT-${today.replace(/-/g, '')}-${String((perDay.get(today) ?? 0) + 1).padStart(4, '0')}`;
  }

  // ---------- บันทึกลง DB ----------
  const strip = <T extends object>(list: T[], ...keys: string[]) =>
    list.map((r) => Object.fromEntries(Object.entries(r).filter(([k]) => !keys.includes(k))));
  const insert = async (label: string, list: object[], fn: (chunk: any[]) => Promise<unknown>) => {
    for (let i = 0; i < list.length; i += 2000) await fn(list.slice(i, i + 2000));
    console.log(`${label.padEnd(20)} ${list.length}`);
  };
  await insert('table_sessions', rows.sessions, (data) => prisma.tableSession.createMany({ data }));
  await insert('bill_splits', rows.billSplits, (data) => prisma.billSplit.createMany({ data }));
  await insert('payments', rows.payments, (data) => prisma.payment.createMany({ data }));
  await insert('orders', strip(rows.orders, '_lines', '_day'), (data) => prisma.order.createMany({ data }));
  await insert('order_items', rows.orderItems, (data) => prisma.orderItem.createMany({ data }));
  await insert('order_item_options', rows.orderItemOptions, (data) => prisma.orderItemOption.createMany({ data }));
  await insert('receipts', strip(rows.receipts, '_table'), (data) => prisma.receipt.createMany({ data }));
  await insert('receipt_items', rows.receiptItems, (data) => prisma.receiptItem.createMany({ data }));
  await insert('service_requests', rows.serviceRequests, (data) => prisma.serviceRequest.createMany({ data }));
  await insert('expenses', rows.expenses, (data) => prisma.expense.createMany({ data }));
  await insert('daily_cash_closes', rows.cashCloses, (data) => prisma.dailyCashClose.createMany({ data }));
  await insert('audit_logs', rows.audits, (data) => prisma.auditLog.createMany({ data }));
  await prisma.appSetting.createMany({
    data: [
      { key: 'line.enabled', value: 'false', updatedByName: OWNER.name },
      { key: 'line.to', value: '', updatedByName: OWNER.name },
    ],
    skipDuplicates: true,
  });

  const revenue = rows.payments.filter((p) => p.status === PaymentStatus.COMPLETED).reduce((s, p) => s + Number(p.amount), 0);
  console.log(`\nเมนู ${MENU.length} · วัตถุดิบ ${INGREDIENTS.length} · โต๊ะ ${TABLES.length} + กลับบ้าน · วันเปิดร้าน ${openDays.length} วัน`);
  console.log(`ยอดขายรวม ${revenue.toLocaleString('th-TH')} บาท · รูปเมนูคัดลอกไป ${dir}`);
  console.log(
    EXISTING_USERS
      ? `ใช้บัญชีที่มีอยู่: ${[admin, staff, kitchen].map((u) => `${u.name} (${u.role})`).join(', ')}`
      : `บัญชีใหม่ (staff2@ / parttime@) รหัส ${NEW_USER_PASSWORD} — บัญชีเดิมใช้รหัสเดิม`,
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
