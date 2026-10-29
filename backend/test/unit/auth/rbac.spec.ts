import 'reflect-metadata';
import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Role } from '@prisma/client';
import { AuditController } from '../../../src/audit/audit.controller';
import { AuthController } from '../../../src/auth/auth.controller';
import { PasswordChangeGuard } from '../../../src/auth/guards/password-change.guard';
import { RolesGuard } from '../../../src/auth/guards/roles.guard';
import { CashClosesController } from '../../../src/cash-closes/cash-closes.controller';
import { CategoriesController } from '../../../src/categories/categories.controller';
import { ExpensesController } from '../../../src/expenses/expenses.controller';
import { HealthController } from '../../../src/health/health.controller';
import { IngredientsController } from '../../../src/ingredients/ingredients.controller';
import { LineSettingsController } from '../../../src/line/line-settings.controller';
import { MenuController } from '../../../src/menu/menu.controller';
import { OrdersController } from '../../../src/orders/orders.controller';
import { PaymentsController } from '../../../src/payments/payments.controller';
import { PublicController } from '../../../src/public/public.controller';
import { ReportsController } from '../../../src/reports/reports.controller';
import { ServiceRequestsController } from '../../../src/service-requests/service-requests.controller';
import { TableSessionsController } from '../../../src/table-sessions/table-sessions.controller';
import { TablesController } from '../../../src/tables/tables.controller';
import { UploadsController } from '../../../src/uploads/uploads.controller';
import { UsersController } from '../../../src/users/users.controller';
import { allowsDuringPasswordChange, isPublic, rolesOf, routeHandlers } from '../helpers/controller';

const { ADMIN: A, STAFF: S, KITCHEN: K } = Role;
/** PUBLIC = ไม่ต้อง login, ANY = login แล้วทุก role */
type Access = 'PUBLIC' | 'ANY' | Role[];

/**
 * ตารางสิทธิ์ทั้งระบบ — แก้สิทธิ์ endpoint ไหนต้องแก้ตารางนี้ด้วย (ตั้งใจให้เทสต์พังเตือน)
 * route ใหม่ที่ไม่อยู่ในตารางก็พัง เพื่อบังคับให้คิดเรื่องสิทธิ์ทุกครั้ง
 */
const MATRIX: [new (...a: any[]) => any, Record<string, Access>][] = [
  [HealthController, { check: 'PUBLIC' }],
  [PublicController, {
    getMenu: 'PUBLIC', getSession: 'PUBLIC', getOrdersBySession: 'PUBLIC', createOrder: 'PUBLIC',
    getOrderStatus: 'PUBLIC', callStaff: 'PUBLIC', checkout: 'PUBLIC',
  }],
  [AuthController, { login: 'PUBLIC', me: 'ANY', changePassword: [A] }],
  [AuditController, { findAll: [A], findDevices: [A] }],
  [ReportsController, { getDashboard: [A], getIncomeExpense: [A], getSales: [A] }],
  [UsersController, { create: [A], findAll: [A], findOne: [A], update: [A], remove: [A] }],
  [LineSettingsController, { get: [A], update: [A], test: [A] }],
  [UploadsController, { uploadMenuImage: [A] }],
  [ExpensesController, {
    create: [A], createFromDrawer: [A, S], findAll: [A], findOne: [A], update: [A], remove: [A],
  }],
  [CashClosesController, { preview: [A, S], create: [A, S], findAll: [A], findOne: [A], remove: [A] }],
  [CategoriesController, { create: [A], findAll: 'ANY', findOne: 'ANY', update: [A], remove: [A] }],
  [TablesController, { create: [A], findAll: 'ANY', findOne: 'ANY', update: [A], remove: [A] }],
  [MenuController, {
    create: [A], findAll: 'ANY', findOne: 'ANY', setAvailability: [A, K], update: [A], remove: [A],
    createOption: [A], updateOption: [A], removeOption: [A],
  }],
  [IngredientsController, { create: [A], findAll: 'ANY', findOne: 'ANY', update: [A, K], remove: [A] }],
  [OrdersController, {
    create: [A, S], createTakeaway: [A, S], findAll: 'ANY', findOne: 'ANY', getTotal: 'ANY',
    updateStatus: [A, K], markCleared: [A, K], addItem: [A, S], removeItem: [A, S],
  }],
  [PaymentsController, {
    create: [A, S], voidPayment: [A, S], findAll: [A, S], findOne: [A, S], recheckSlip: [A, S], confirmSlip: [A],
  }],
  [TableSessionsController, {
    create: [A, S], findAll: [A, S], findOne: [A, S], setGuestCount: [A, S], move: [A, S], merge: [A, S],
    close: [A, S],
  }],
  [ServiceRequestsController, {
    create: [A, S], findAll: [A, S], findOne: [A, S], updatePaymentMethod: [A, S], resolve: [A, S], cancel: [A, S],
  }],
];

function ctx(ctrl: any, method: string, user?: Record<string, unknown>): ExecutionContext {
  return {
    getType: () => 'http',
    getHandler: () => ctrl.prototype[method],
    getClass: () => ctrl,
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
  } as any;
}

const rolesGuard = new RolesGuard(new Reflector());

describe('สิทธิ์ตาม role ของทุก endpoint', () => {
  describe.each(MATRIX.map(([ctrl, routes]) => [ctrl.name, ctrl, routes] as const))('%s', (_name, ctrl, routes) => {
    it('ทุก route อยู่ในตารางสิทธิ์ (ไม่มี route ตกหล่น)', () => {
      expect(routeHandlers(ctrl).sort()).toEqual(Object.keys(routes).sort());
    });

    it.each(Object.entries(routes))('%s → %j', (method, access) => {
      if (access === 'PUBLIC') {
        expect(isPublic(ctrl, method)).toBe(true);
        return;
      }
      expect(isPublic(ctrl, method)).toBe(false);
      const roles = rolesOf(ctrl, method);
      if (access === 'ANY') {
        expect(roles ?? []).toEqual([]);
      } else {
        expect([...(roles ?? [])].sort()).toEqual([...access].sort());
      }

      // ผ่าน RolesGuard จริงทีละ role
      for (const role of [A, S, K]) {
        const allowed = access === 'ANY' || access.includes(role);
        expect(rolesGuard.canActivate(ctx(ctrl, method, { role }))).toBe(allowed);
      }
    });
  });

  it('route ที่จำกัด role แต่ไม่มี user (เช่น token ไม่ผ่าน) → ไม่ให้ผ่าน', () => {
    expect(rolesGuard.canActivate(ctx(UsersController, 'findAll', undefined))).toBe(false);
  });

  it('บัญชีที่ต้องเปลี่ยนรหัส ใช้ได้แค่ /auth/me กับ /auth/password', () => {
    const guard = new PasswordChangeGuard(new Reflector());
    const pending = { role: A, mustChangePassword: true };
    expect(allowsDuringPasswordChange(AuthController, 'me')).toBe(true);
    expect(allowsDuringPasswordChange(AuthController, 'changePassword')).toBe(true);
    expect(guard.canActivate(ctx(AuthController, 'me', pending))).toBe(true);
    expect(() => guard.canActivate(ctx(ReportsController, 'getDashboard', pending))).toThrow(ForbiddenException);

    const allowedElsewhere = MATRIX.flatMap(([c, routes]) =>
      Object.keys(routes)
        .filter((m) => allowsDuringPasswordChange(c, m))
        .map((m) => `${c.name}.${m}`),
    );
    expect(allowedElsewhere.sort()).toEqual(['AuthController.changePassword', 'AuthController.me']);
  });
});
