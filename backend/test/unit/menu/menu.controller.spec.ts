import { MenuController } from '../../../src/menu/menu.controller';
import { auditOf, autoMock, describeDelegations } from '../helpers/controller';

describe('MenuController', () => {
  describeDelegations(
    () => {
      const service = autoMock();
      return { controller: new MenuController(service as any), service };
    },
    [
      ['create', [{ name: 'x' }], 'create', [{ name: 'x' }]],
      ['findAll', ['c1', 'true'], 'findAll', [{ categoryId: 'c1', onlyAvailable: true }]],
      ['findAll', [undefined, 'false'], 'findAll', [{ categoryId: undefined, onlyAvailable: false }]],
      ['findAll', [undefined, undefined], 'findAll', [{ categoryId: undefined, onlyAvailable: false }]],
      ['findOne', ['m1'], 'findOne', ['m1']],
      // ครัวกดปิด/เปิดขายได้ แต่ส่งไปได้แค่ isAvailable — ฟิลด์อื่นใน body ไม่หลุดไปแก้ราคา/ชื่อ
      ['setAvailability', ['m1', { isAvailable: false, price: 1 }], 'update', ['m1', { isAvailable: false }]],
      ['update', ['m1', { price: 99 }], 'update', ['m1', { price: 99 }]],
      ['remove', ['m1'], 'remove', ['m1']],
      ['createOption', ['m1', { name: 'ไข่' }], 'createOption', ['m1', { name: 'ไข่' }]],
      ['updateOption', ['m1', 'op1', { price: 5 }], 'updateOption', ['m1', 'op1', { price: 5 }]],
      ['removeOption', ['m1', 'op1'], 'removeOption', ['m1', 'op1']],
    ],
  );

  it('ประวัติแก้เมนูเก็บค่าก่อน/หลัง และลบเมนูเก็บค่าที่ถูกลบ', () => {
    const update = auditOf(MenuController, 'update')!;
    expect(update.action).toBe('MENU_UPDATE');
    expect(update.details!({ before: { price: 50 }, body: { price: 60 } } as any)).toEqual({
      before: { price: 50 },
      changes: { price: 60 },
    });
    const remove = auditOf(MenuController, 'remove')!;
    expect(remove.action).toBe('MENU_DELETE');
    expect(remove.details!({ before: { name: 'x' } } as any)).toEqual({ name: 'x' });
  });
});
