import { Reflector } from '@nestjs/core';
import { Role } from '@prisma/client';
import { AUDIT_KEY, AuditOptions } from '../../../src/audit/audit.decorator';
import { ALLOW_DURING_PASSWORD_CHANGE_KEY } from '../../../src/auth/decorators/allow-password-change.decorator';
import { IS_PUBLIC_KEY } from '../../../src/auth/decorators/public.decorator';
import { ROLES_KEY } from '../../../src/auth/decorators/roles.decorator';

type Ctor = new (...args: any[]) => any;
const reflector = new Reflector();

const handlerOf = (ctrl: Ctor, method: string) => {
  const fn = ctrl.prototype[method];
  if (typeof fn !== 'function') throw new Error(`${ctrl.name}.${method} ไม่มีอยู่`);
  return fn;
};

/** role ที่ RolesGuard จะใช้จริง (handler ทับ class) — undefined = ทุกคนที่ login แล้ว */
export const rolesOf = (ctrl: Ctor, method: string): Role[] | undefined =>
  reflector.getAllAndOverride<Role[]>(ROLES_KEY, [handlerOf(ctrl, method), ctrl]);

export const isPublic = (ctrl: Ctor, method: string): boolean =>
  !!reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [handlerOf(ctrl, method), ctrl]);

export const allowsDuringPasswordChange = (ctrl: Ctor, method: string): boolean =>
  !!reflector.getAllAndOverride<boolean>(ALLOW_DURING_PASSWORD_CHANGE_KEY, [handlerOf(ctrl, method), ctrl]);

export const auditOf = (ctrl: Ctor, method: string): AuditOptions | undefined =>
  reflector.get<AuditOptions>(AUDIT_KEY, handlerOf(ctrl, method));

/** ชื่อ method ที่เป็น route handler (มี metadata path ของ Nest) */
export const routeHandlers = (ctrl: Ctor): string[] =>
  Object.getOwnPropertyNames(ctrl.prototype).filter(
    (name) => name !== 'constructor' && Reflect.getMetadata('path', ctrl.prototype[name]) !== undefined,
  );

/** service ปลอม — ทุก method เป็น jest.fn ที่คืนค่าเฉพาะตัว ไว้เช็คว่า controller คืนผลของ service ตรง ๆ */
export function autoMock<T = any>(): T & Record<string, jest.Mock> {
  const fns: Record<string, jest.Mock> = {};
  return new Proxy(fns, {
    get(target, prop: string) {
      if (prop === 'then') return undefined;
      if (!target[prop]) target[prop] = jest.fn().mockReturnValue({ from: prop });
      return target[prop];
    },
  }) as any;
}

/** [handler, args ที่ส่งเข้า controller, method ของ service, args ที่ service ควรได้] */
export type Delegation = [string, unknown[], string, unknown[]];

/** controller บาง ๆ ควรส่งต่อไปที่ service ด้วย args ที่ถูก แล้วคืนผลของ service ตรง ๆ */
export function describeDelegations(
  make: () => { controller: any; service: Record<string, jest.Mock> },
  cases: Delegation[],
) {
  const named = cases.map((c) => [`${c[0]} → service.${c[2]}`, ...c] as const);
  it.each(named)('%s', async (_label, handler, args, serviceMethod, expected) => {
    const { controller, service } = make();
    const result = await controller[handler](...args);
    expect(service[serviceMethod]).toHaveBeenCalledWith(...expected);
    expect(result).toEqual({ from: serviceMethod });
  });
}

export const user = (role: Role, overrides: Record<string, unknown> = {}) => ({
  id: `u-${role.toLowerCase()}`,
  email: `${role.toLowerCase()}@x`,
  name: role,
  role,
  ...overrides,
});
