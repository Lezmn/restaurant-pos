import { BadRequestException } from '@nestjs/common';
import {
  deductStock,
  mergeUsage,
  restoreStock,
  stockUsageOf,
  toStockUsage,
} from './ingredient-stock';

const egg = { id: 'egg', name: 'ไข่', stockQty: 10 };
const pork = { id: 'pork', name: 'หมู', stockQty: null };

describe('stockUsageOf', () => {
  it('วัตถุดิบหลักละ 1 + usageQty ของตัวเลือก คูณจำนวนจาน', () => {
    expect(
      stockUsageOf(2, [egg], [{ usageQty: 1, ingredient: egg }]),
    ).toEqual({ egg: 4 });
  });

  it('ไม่นับวัตถุดิบที่ไม่ได้นับสต็อก และตัวเลือกที่ usageQty = 0', () => {
    expect(
      stockUsageOf(3, [pork], [
        { usageQty: 0, ingredient: egg },
        { usageQty: 2, ingredient: pork },
        { usageQty: 1, ingredient: null },
      ]),
    ).toEqual({});
  });
});

describe('mergeUsage / toStockUsage', () => {
  it('รวมยอดหลายรายการ', () => {
    expect(mergeUsage([{ egg: 1 }, { egg: 2, pork: 1 }, null])).toEqual({ egg: 3, pork: 1 });
  });

  it('อ่าน Json จาก DB แล้วทิ้งค่าที่ไม่ใช่ตัวเลขบวก', () => {
    expect(toStockUsage({ egg: 2, bad: 'x', zero: 0 })).toEqual({ egg: 2 });
    expect(toStockUsage(null)).toEqual({});
    expect(toStockUsage([1, 2])).toEqual({});
  });
});

function txMock() {
  return {
    ingredient: {
      updateMany: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
    },
  };
}

describe('deductStock', () => {
  it('ตัดแบบมีเงื่อนไข และปิดวัตถุดิบที่เหลือ 0', async () => {
    const tx = txMock();
    tx.ingredient.updateMany
      .mockResolvedValueOnce({ count: 1 }) // ตัดยอด
      .mockResolvedValueOnce({ count: 1 }); // ปิดตัวที่เหลือ 0
    await expect(deductStock(tx as any, { egg: 2 })).resolves.toBe(true);
    expect(tx.ingredient.updateMany).toHaveBeenNthCalledWith(1, {
      where: { id: 'egg', stockQty: { gte: 2 } },
      data: { stockQty: { decrement: 2 } },
    });
  });

  it('ยอดไม่พอ → 400 บอกชื่อและยอดที่เหลือ', async () => {
    const tx = txMock();
    tx.ingredient.updateMany.mockResolvedValueOnce({ count: 0 });
    tx.ingredient.findUnique.mockResolvedValue({ name: 'ไข่', stockQty: 1 });
    await expect(deductStock(tx as any, { egg: 2 })).rejects.toBeInstanceOf(BadRequestException);
  });

  it('ไม่มีอะไรต้องตัด → ไม่แตะ DB', async () => {
    const tx = txMock();
    await expect(deductStock(tx as any, {})).resolves.toBe(false);
    expect(tx.ingredient.updateMany).not.toHaveBeenCalled();
  });
});

describe('restoreStock', () => {
  it('คืนยอด และเปิดคืนเฉพาะตัวที่ถูกปิดเพราะยอดเหลือ 0', async () => {
    const tx = txMock();
    tx.ingredient.findMany.mockResolvedValue([
      { id: 'egg', stockQty: 0, isAvailable: false }, // ปิดเพราะหมด → เปิดคืน
      { id: 'pork', stockQty: 5, isAvailable: false }, // ปิดด้วยมือ → ไม่แตะ
    ]);
    tx.ingredient.updateMany.mockResolvedValue({ count: 1 });
    await expect(restoreStock(tx as any, { egg: 2, pork: 1 })).resolves.toBe(true);
    expect(tx.ingredient.update).toHaveBeenCalledTimes(2);
    expect(tx.ingredient.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['egg'] } },
      data: { isAvailable: true },
    });
  });
});
