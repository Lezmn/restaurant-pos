import { BadRequestException, ConflictException } from '@nestjs/common';
import { OrderStatus, Prisma } from '@prisma/client';
import {
  carveOutItems,
  lockSessionSplit,
  previewSelection,
  releaseUnpaidSplits,
} from '../../../src/payments/bill-split';

const D = (v: number | string) => new Prisma.Decimal(v);

/** รายการทรงเดียวกับ SELECTED_ITEM_INCLUDE */
function item(
  id: string,
  qty: number,
  price: number,
  order: Partial<{
    id: string;
    status: OrderStatus;
    paymentId: string | null;
    tableSessionId: string | null;
    items: { id: string; quantity: number }[];
  }> = {},
  options: number[] = [],
) {
  const orderId = order.id ?? 'o1';
  return {
    id,
    orderId,
    quantity: qty,
    unitPrice: D(price),
    menuItemId: `m-${id}`,
    customName: null,
    note: null,
    selectedOptions: options.map((p, i) => ({ name: `opt${i}`, price: D(p), menuOptionId: `mo${i}` })),
    order: {
      id: orderId,
      tableId: 't1',
      tableSessionId: 's1',
      status: OrderStatus.SERVED,
      paymentId: null,
      createdAt: new Date('2026-05-01T10:00:00Z'),
      clearedAt: null,
      items: [{ id, quantity: qty }],
      ...order,
    },
  };
}

function tx(items: unknown[], splits: unknown[] = []) {
  return {
    orderItem: {
      findMany: jest.fn().mockResolvedValue(items),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      create: jest.fn().mockResolvedValue({}),
    },
    order: {
      create: jest.fn().mockResolvedValue({ id: 'carved-1' }),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    billSplit: { findMany: jest.fn().mockResolvedValue(splits), delete: jest.fn() },
    $executeRaw: jest.fn().mockResolvedValue(1),
  } as any;
}

const pick = (orderItemId: string, quantity: number) => ({ orderItemId, quantity });

describe('previewSelection (ยอดของรายการที่เลือก)', () => {
  it('รวมราคา+ตัวเลือก × จำนวนที่เลือก และรวมแถวที่กดซ้ำ', async () => {
    const db = tx([item('a', 3, 20, {}, [5]), item('b', 1, 100)]);
    const res = await previewSelection(db, [pick('a', 1), pick('a', 1), pick('b', 1)]);
    expect(res.subtotal.toFixed(2)).toBe('150.00'); // (20+5)×2 + 100
    expect(res.tableSessionId).toBe('s1');
    expect(db.orderItem.findMany.mock.calls[0][0].where).toEqual({ id: { in: ['a', 'b'] } });
  });

  it('รายการหาย (ถูกจ่าย/ลบจากอีกเครื่อง) → 404 บอก id', async () => {
    await expect(previewSelection(tx([item('a', 1, 10)]), [pick('a', 1), pick('zzz', 1)])).rejects.toThrow(/zzz/);
  });

  it('เลือกข้ามโต๊ะ → 400', async () => {
    const db = tx([item('a', 1, 10), item('b', 1, 10, { id: 'o2', tableSessionId: 's2' })]);
    await expect(previewSelection(db, [pick('a', 1), pick('b', 1)])).rejects.toBeInstanceOf(BadRequestException);
  });

  it('ออเดอร์ไม่มี session (ข้อมูลเก่า) → 400', async () => {
    const db = tx([item('a', 1, 10, { tableSessionId: null })]);
    await expect(previewSelection(db, [pick('a', 1)])).rejects.toBeInstanceOf(BadRequestException);
  });

  it.each([
    ['จ่ายไปแล้ว (paymentId)', { paymentId: 'p1' }, ConflictException],
    ['สถานะ PAID', { status: OrderStatus.PAID }, ConflictException],
    ['ยังไม่เสิร์ฟ', { status: OrderStatus.PREPARING }, BadRequestException],
  ])('%s → error', async (_l, order, Err) => {
    await expect(previewSelection(tx([item('a', 1, 10, order)]), [pick('a', 1)])).rejects.toBeInstanceOf(Err);
  });

  it('เลือกเกินจำนวนที่สั่ง → 400', async () => {
    await expect(previewSelection(tx([item('a', 2, 10)]), [pick('a', 3)])).rejects.toThrow(/สั่งไว้ 2/);
  });
});

describe('carveOutItems (แยกบิลแบบเลือกรายการ)', () => {
  it('เลือกครบทั้งออเดอร์ → ใช้ออเดอร์เดิม ไม่สร้างใหม่', async () => {
    const db = tx([item('a', 2, 10)]);
    await expect(carveOutItems(db, [pick('a', 2)])).resolves.toEqual(['o1']);
    expect(db.order.create).not.toHaveBeenCalled();
  });

  it('เลือกบางจาน → ย้ายจานนั้นไปออเดอร์ใหม่ (เวลาสั่งเดิม, อ้าง splitFrom)', async () => {
    const both = [
      { id: 'a', quantity: 1 },
      { id: 'b', quantity: 1 },
    ];
    const db = tx([item('a', 1, 10, { items: both })]);
    await expect(carveOutItems(db, [pick('a', 1)])).resolves.toEqual(['carved-1']);
    const created = db.order.create.mock.calls[0][0].data;
    expect(created).toMatchObject({
      tableId: 't1',
      tableSessionId: 's1',
      status: OrderStatus.SERVED,
      splitFromId: 'o1',
      createdAt: new Date('2026-05-01T10:00:00Z'),
    });
    expect(created.clearedAt).toBeInstanceOf(Date);
    expect(db.orderItem.updateMany).toHaveBeenCalledWith({
      where: { id: 'a', orderId: 'o1', quantity: 1 },
      data: { orderId: 'carved-1' },
    });
  });

  it('เลือกบางจำนวน (น้ำ 3 จ่าย 1) → ลดของเดิม + สร้างรายการใหม่พร้อมตัวเลือก', async () => {
    const db = tx([item('a', 3, 20, {}, [5])]);
    await carveOutItems(db, [pick('a', 1)]);
    expect(db.orderItem.updateMany).toHaveBeenCalledWith({
      where: { id: 'a', orderId: 'o1', quantity: 3 },
      data: { quantity: 2 },
    });
    const created = db.orderItem.create.mock.calls[0][0].data;
    expect(created).toMatchObject({ orderId: 'carved-1', menuItemId: 'm-a', quantity: 1 });
    expect(created.selectedOptions.create).toEqual([{ name: 'opt0', price: D(5), menuOptionId: 'mo0' }]);
  });

  it.each(['ย้ายทั้งจาน', 'ลดจำนวน'])('%s แต่อีกเครื่องแก้ไปก่อน (count=0) → 409', async (mode) => {
    const db =
      mode === 'ย้ายทั้งจาน'
        ? tx([item('a', 1, 10, { items: [{ id: 'a', quantity: 1 }, { id: 'b', quantity: 1 }] })])
        : tx([item('a', 3, 10)]);
    db.orderItem.updateMany.mockResolvedValue({ count: 0 });
    await expect(carveOutItems(db, [pick('a', 1)])).rejects.toBeInstanceOf(ConflictException);
  });

  it('ยกเลิกการหารเท่ากันที่ยังไม่มีใครจ่ายก่อนแยก', async () => {
    const db = tx([item('a', 1, 10)], [{ id: 'split-1', parts: 3, payments: [] }]);
    await carveOutItems(db, [pick('a', 1)]);
    expect(db.order.updateMany).toHaveBeenCalledWith({
      where: { billSplitId: 'split-1' },
      data: { billSplitId: null },
    });
    expect(db.billSplit.delete).toHaveBeenCalledWith({ where: { id: 'split-1' } });
  });
});

describe('releaseUnpaidSplits / lockSessionSplit', () => {
  it('มีคนจ่ายส่วนหารไปแล้ว → 409 ไม่ลบการหาร', async () => {
    const db = tx([], [{ id: 'split-1', parts: 3, payments: [{ id: 'p1' }] }]);
    await expect(releaseUnpaidSplits(db, ['o1'])).rejects.toThrow(/หารจ่าย 3 คน \(จ่ายแล้ว 1 คน\)/);
    expect(db.billSplit.delete).not.toHaveBeenCalled();
  });

  it('lockSessionSplit ใช้ advisory lock ต่อ session', async () => {
    const db = tx([]);
    await lockSessionSplit(db, 's1');
    expect(db.$executeRaw.mock.calls[0].slice(1)).toEqual([7_420_002, 's1']);
  });
});
