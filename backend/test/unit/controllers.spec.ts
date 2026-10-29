import { Role } from '@prisma/client';
import { AuditController } from '../../src/audit/audit.controller';
import { AuthController } from '../../src/auth/auth.controller';
import { CashClosesController } from '../../src/cash-closes/cash-closes.controller';
import { CategoriesController } from '../../src/categories/categories.controller';
import { ExpensesController } from '../../src/expenses/expenses.controller';
import { PublicController } from '../../src/public/public.controller';
import { ReportsController } from '../../src/reports/reports.controller';
import { ServiceRequestsController } from '../../src/service-requests/service-requests.controller';
import { TableSessionsController } from '../../src/table-sessions/table-sessions.controller';
import { TablesController } from '../../src/tables/tables.controller';
import { auditOf, autoMock, describeDelegations, user } from './helpers/controller';

/**
 * controller ที่แค่ส่งต่อไป service — เช็คว่าแกะ param/query/body/user ถูกตัวและคืนผลของ service ตรง ๆ
 * controller ที่มี logic ของตัวเอง (orders, payments, menu, ingredients, users, line, uploads) แยกไฟล์ไว้ในโฟลเดอร์ของ module
 */
const admin = user(Role.ADMIN);
const staff = user(Role.STAFF);

function thin<C>(Ctrl: new (svc: any) => C) {
  return () => {
    const service = autoMock();
    return { controller: new Ctrl(service), service };
  };
}

describe('AuthController', () => {
  describeDelegations(thin(AuthController), [
    ['login', [{ email: 'a@x', password: 'p' }], 'login', [{ email: 'a@x', password: 'p' }]],
    ['changePassword', [{ user: admin }, { currentPassword: 'a', newPassword: 'b' }], 'changePassword', [
      admin.id,
      { currentPassword: 'a', newPassword: 'b' },
    ]],
  ]);

  it('me คืน user จาก token ตรง ๆ (ไม่ต้องถาม DB อีก)', () => {
    const service = autoMock();
    expect(new AuthController(service as any).me({ user: staff as any })).toBe(staff);
  });
});

describe('AuditController', () => {
  describeDelegations(thin(AuditController), [
    ['findAll', [{ limit: 10 }], 'findAll', [{ limit: 10 }]],
    ['findDevices', [], 'findDevices', []],
  ]);
});

describe('ReportsController', () => {
  describeDelegations(thin(ReportsController), [
    ['getDashboard', [], 'getDashboard', []],
    ['getIncomeExpense', [{ month: '2026-05' }], 'getIncomeExpense', [{ month: '2026-05' }]],
    ['getSales', [{ from: '2026-05-01' }], 'getSales', [{ from: '2026-05-01' }]],
  ]);
});

describe('CategoriesController', () => {
  describeDelegations(thin(CategoriesController), [
    ['create', [{ name: 'x' }], 'create', [{ name: 'x' }]],
    ['findAll', [], 'findAll', []],
    ['findOne', ['c1'], 'findOne', ['c1']],
    ['update', ['c1', { name: 'y' }], 'update', ['c1', { name: 'y' }]],
    ['remove', ['c1'], 'remove', ['c1']],
  ]);
});

describe('TablesController', () => {
  describeDelegations(thin(TablesController), [
    ['create', [{ number: 1 }], 'create', [{ number: 1 }]],
    ['findAll', [{ status: 'AVAILABLE', includeInactive: true }], 'findAll', ['AVAILABLE', true]],
    ['findOne', ['t1'], 'findOne', ['t1']],
    ['update', ['t1', { seats: 2 }], 'update', ['t1', { seats: 2 }]],
    ['remove', ['t1'], 'remove', ['t1']],
  ]);
});

describe('TableSessionsController', () => {
  describeDelegations(thin(TableSessionsController), [
    ['create', [{ tableId: 't1' }], 'create', [{ tableId: 't1' }]],
    ['findAll', [{ status: 'OPEN' }], 'findAll', ['OPEN']],
    ['findOne', ['s1'], 'findOne', ['s1']],
    ['close', ['s1'], 'close', ['s1']],
  ]);
});

describe('ServiceRequestsController', () => {
  describeDelegations(thin(ServiceRequestsController), [
    ['create', [{ tableId: 't1' }], 'create', [{ tableId: 't1' }]],
    ['findAll', [{ status: 'PENDING' }], 'findAll', [{ status: 'PENDING' }]],
    ['findOne', ['r1'], 'findOne', ['r1']],
    ['updatePaymentMethod', ['r1', { paymentMethod: 'CASH' }], 'updatePaymentMethod', ['r1', 'CASH']],
    ['resolve', ['r1'], 'resolve', ['r1']],
    ['cancel', ['r1'], 'cancel', ['r1']],
  ]);
});

describe('PublicController', () => {
  describeDelegations(thin(PublicController), [
    ['getMenu', [], 'getMenu', []],
    ['getSession', ['tok'], 'getSession', ['tok']],
    ['getOrdersBySession', ['tok'], 'getOrdersBySession', ['tok']],
    ['createOrder', [{ sessionToken: 'tok', items: [] }], 'createOrder', [{ sessionToken: 'tok', items: [] }]],
    ['getOrderStatus', ['o1', 'tok'], 'getOrderStatus', ['o1', 'tok']],
    ['callStaff', [{ sessionToken: 'tok' }], 'callStaff', [{ sessionToken: 'tok' }]],
    ['checkout', [{ sessionToken: 'tok' }], 'checkout', [{ sessionToken: 'tok' }]],
  ]);
});

describe('ExpensesController', () => {
  describeDelegations(thin(ExpensesController), [
    ['create', [{ title: 'x' }, { user: admin }], 'create', [{ title: 'x' }, admin]],
    ['createFromDrawer', [{ title: 'x' }, { user: staff }], 'createFromDrawer', [{ title: 'x' }, staff]],
    ['findAll', [{ month: '2026-05' }], 'findAll', [{ month: '2026-05' }]],
    ['findOne', ['e1'], 'findOne', ['e1']],
    ['update', ['e1', { amount: 1 }], 'update', ['e1', { amount: 1 }]],
    ['remove', ['e1'], 'remove', ['e1']],
  ]);

  it('ประวัติ: เงินออกจากลิ้นชัก/สร้าง/แก้/ลบ ถูกบันทึกทุกครั้ง', () => {
    expect(auditOf(ExpensesController, 'createFromDrawer')?.action).toBe('EXPENSE_DRAWER');
    expect(auditOf(ExpensesController, 'create')?.targetId?.({ result: { id: 'e9' } } as any)).toBe('e9');
    const update = auditOf(ExpensesController, 'update')!;
    expect(update.action).toBe('EXPENSE_UPDATE');
    expect(update.details?.({ before: { amount: 1 }, body: { amount: 2 } } as any)).toEqual({
      before: { amount: 1 },
      changes: { amount: 2 },
    });
    expect(auditOf(ExpensesController, 'remove')?.details?.({ before: { title: 'x' } } as any)).toEqual({ title: 'x' });
  });
});

describe('CashClosesController', () => {
  describeDelegations(thin(CashClosesController), [
    ['preview', [{ date: '2026-05-01' }], 'preview', ['2026-05-01']],
    ['create', [{ countedCash: 100 }, { user: staff }], 'create', [{ countedCash: 100 }, staff]],
    ['findAll', [{ month: '2026-05' }], 'findAll', [{ month: '2026-05' }]],
    ['findOne', ['c1'], 'findOne', ['c1']],
    ['remove', ['c1'], 'remove', ['c1']],
  ]);

  it('ประวัติปิดยอดเก็บตัวเลขสำคัญ ไม่เก็บทั้งก้อน', () => {
    const audit = auditOf(CashClosesController, 'create')!;
    const result = {
      id: 'cc1',
      date: '2026-05-01',
      openingFloat: 500,
      expectedCash: 1000,
      countedCash: 990,
      difference: -10,
      closedById: 'u1',
    };
    expect(audit.targetId?.({ result } as any)).toBe('cc1');
    expect(audit.details?.({ result } as any)).toEqual({
      date: '2026-05-01',
      openingFloat: 500,
      expectedCash: 1000,
      countedCash: 990,
      difference: -10,
      note: null,
    });
    expect(auditOf(CashClosesController, 'remove')?.action).toBe('CASH_CLOSE_DELETE');
  });
});
