import { OrdersController } from '../../../src/orders/orders.controller';
import { auditOf, autoMock, describeDelegations } from '../helpers/controller';

describe('OrdersController', () => {
  describeDelegations(
    () => {
      const service = autoMock();
      return { controller: new OrdersController(service as any), service };
    },
    [
      ['create', [{ tableSessionId: 's1', items: [] }], 'create', [{ tableSessionId: 's1', items: [] }]],
      ['createTakeaway', [{ items: [] }], 'createTakeaway', [{ items: [] }]],
      ['findAll', [{ status: 'PENDING' }], 'findAll', [{ status: 'PENDING' }]],
      ['findOne', ['o1'], 'findOne', ['o1']],
      ['getTotal', ['o1'], 'getTotal', ['o1']],
      ['updateStatus', ['o1', { status: 'SERVED' }], 'updateStatus', ['o1', 'SERVED']],
      ['markCleared', ['o1'], 'markCleared', ['o1']],
      ['addItem', ['o1', { menuItemId: 'm1', quantity: 1 }], 'addItem', ['o1', { menuItemId: 'm1', quantity: 1 }]],
      ['removeItem', ['o1', 'i1'], 'removeItem', ['o1', 'i1']],
    ],
  );

  describe('ประวัติ (@Audit)', () => {
    it('updateStatus เก็บเฉพาะตอนยกเลิก พร้อมรายการในออเดอร์', () => {
      const audit = auditOf(OrdersController, 'updateStatus')!;
      const action = audit.action as (ctx: any) => string | null;
      expect(action({ body: { status: 'CANCELLED' } })).toBe('ORDER_CANCEL');
      expect(action({ body: { status: 'SERVED' } })).toBeNull();

      const before = {
        status: 'PENDING',
        table: { number: 2 },
        items: [
          { customName: null, menuItem: { name: 'ผัดไทย' }, quantity: 2, unitPrice: 50 },
          { customName: 'ข้าวเปล่า', menuItem: null, quantity: 1, unitPrice: 10 },
          { customName: null, menuItem: null, quantity: 1, unitPrice: 0 },
        ],
      };
      expect(audit.details!({ before } as any)).toEqual({
        tableNumber: 2,
        previousStatus: 'PENDING',
        items: [
          { name: 'ผัดไทย', quantity: 2, unitPrice: 50 },
          { name: 'ข้าวเปล่า', quantity: 1, unitPrice: 10 },
          { name: null, quantity: 1, unitPrice: 0 },
        ],
      });
      expect(audit.details!({ before: null } as any)).toEqual({ tableNumber: null, previousStatus: null, items: [] });
    });

    it('removeItem เก็บรายละเอียดรายการที่ถูกลบ', () => {
      const audit = auditOf(OrdersController, 'removeItem')!;
      expect(audit.action).toBe('ORDER_ITEM_REMOVE');
      const before = {
        quantity: 1,
        unitPrice: 60,
        note: 'ไม่ผัก',
        customName: null,
        menuItem: { name: 'กะเพรา' },
        selectedOptions: [{ name: 'ไข่ดาว' }],
        order: { status: 'SERVED', table: { number: 9 } },
      };
      expect(audit.details!({ before } as any)).toEqual({
        tableNumber: 9,
        orderStatus: 'SERVED',
        name: 'กะเพรา',
        options: ['ไข่ดาว'],
        quantity: 1,
        unitPrice: 60,
        note: 'ไม่ผัก',
      });
      expect(audit.details!({ before: null } as any)).toMatchObject({ tableNumber: null, name: null, options: [] });
    });
  });
});
