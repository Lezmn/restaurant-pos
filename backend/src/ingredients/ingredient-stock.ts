import { BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';

/** ยอดวัตถุดิบที่ใช้ { ingredientId: จำนวน } — เก็บลง order_items.stockUsed ด้วยรูปนี้ */
export type StockUsage = Record<string, number>;

type TrackedIngredient = { id: string; name: string; stockQty: number | null };

/**
 * ยอดที่ 1 รายการใช้ = จำนวนจาน × (วัตถุดิบหลักของเมนูละ 1 + usageQty ของตัวเลือกที่เลือก)
 * นับเฉพาะวัตถุดิบที่นับสต็อกอยู่ (stockQty ไม่ใช่ null) ตัวที่ไม่นับยังปิดด้วยมือแบบเดิม
 */
export function stockUsageOf(
  quantity: number,
  mainIngredients: TrackedIngredient[],
  options: { usageQty: number; ingredient: TrackedIngredient | null }[],
): StockUsage {
  const usage: StockUsage = {};
  const add = (ingredient: TrackedIngredient, perDish: number) => {
    if (typeof ingredient.stockQty !== 'number' || perDish <= 0) return;
    usage[ingredient.id] = (usage[ingredient.id] ?? 0) + perDish * quantity;
  };
  for (const ingredient of mainIngredients) add(ingredient, 1);
  for (const option of options) {
    if (option.ingredient) add(option.ingredient, option.usageQty);
  }
  return usage;
}

export function mergeUsage(usages: (StockUsage | null | undefined)[]): StockUsage {
  const total: StockUsage = {};
  for (const usage of usages) {
    for (const [id, qty] of Object.entries(usage ?? {})) {
      total[id] = (total[id] ?? 0) + qty;
    }
  }
  return total;
}

/** stockUsed ที่อ่านกลับจาก DB เป็น Json — กรองให้เหลือแต่ตัวเลขบวก */
export function toStockUsage(value: Prisma.JsonValue | null | undefined): StockUsage {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const usage: StockUsage = {};
  for (const [id, qty] of Object.entries(value)) {
    if (typeof qty === 'number' && qty > 0) usage[id] = qty;
  }
  return usage;
}

/**
 * ตัดสต็อกใน transaction เดียวกับการสร้างออเดอร์
 * ตัดแบบมีเงื่อนไข (stockQty >= ที่ต้องใช้) ในคำสั่งเดียว — สองโต๊ะแย่งที่สุดท้ายพร้อมกัน ได้แค่โต๊ะเดียว
 * เหลือ 0 แล้วปิดวัตถุดิบให้เอง คืน true ถ้ามีวัตถุดิบถูกปิด (ต้องบอกทุกจอให้ดึงเมนูใหม่)
 */
export async function deductStock(
  tx: Prisma.TransactionClient,
  usage: StockUsage,
): Promise<boolean> {
  const ids = Object.keys(usage);
  if (ids.length === 0) return false;

  for (const id of ids) {
    const need = usage[id];
    const result = await tx.ingredient.updateMany({
      where: { id, stockQty: { gte: need } },
      data: { stockQty: { decrement: need } },
    });
    if (result.count === 0) {
      const ingredient = await tx.ingredient.findUnique({
        where: { id },
        select: { name: true, stockQty: true },
      });
      throw new BadRequestException(
        `วัตถุดิบ "${ingredient?.name ?? id}" เหลือ ${ingredient?.stockQty ?? 0} ไม่พอ (ต้องใช้ ${need})`,
      );
    }
  }

  const closed = await tx.ingredient.updateMany({
    where: { id: { in: ids }, stockQty: { lte: 0 }, isAvailable: true },
    data: { isAvailable: false },
  });
  return closed.count > 0;
}

/**
 * คืนสต็อก (ยกเลิกออเดอร์ที่ครัวยังไม่ได้ทำ / ลบรายการ)
 * ตัวที่ถูกปิดเพราะยอดเหลือ 0 จะเปิดคืนให้เอง — ตัวที่ยังมียอดอยู่แต่ถูกปิดด้วยมือ ไม่แตะ
 * คืน true ถ้ามีวัตถุดิบถูกเปิดคืน
 */
export async function restoreStock(
  tx: Prisma.TransactionClient,
  usage: StockUsage,
): Promise<boolean> {
  const ids = Object.keys(usage);
  if (ids.length === 0) return false;

  // วัตถุดิบที่เลิกนับสต็อกไปแล้ว (stockQty = null) ไม่ต้องคืน
  const before = await tx.ingredient.findMany({
    where: { id: { in: ids }, stockQty: { not: null } },
    select: { id: true, stockQty: true, isAvailable: true },
  });

  const reopenIds: string[] = [];
  for (const ingredient of before) {
    await tx.ingredient.update({
      where: { id: ingredient.id },
      data: { stockQty: { increment: usage[ingredient.id] } },
    });
    if (!ingredient.isAvailable && (ingredient.stockQty ?? 0) <= 0) {
      reopenIds.push(ingredient.id);
    }
  }

  if (reopenIds.length === 0) return false;
  await tx.ingredient.updateMany({
    where: { id: { in: reopenIds } },
    data: { isAvailable: true },
  });
  return true;
}
