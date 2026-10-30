import { Prisma, TableSessionStatus } from '@prisma/client';
import { EventsGateway } from '../../../src/events/events.gateway';
import { SocketIoAdapter } from '../../../src/events/socket-io.adapter';

function client(auth: Record<string, unknown> | undefined, cookie?: string) {
  return {
    id: 'sock-1',
    handshake: { auth, headers: cookie ? { cookie } : {} },
    data: {} as Record<string, unknown>,
    join: jest.fn().mockResolvedValue(undefined),
    emit: jest.fn(),
    disconnect: jest.fn(),
  } as any;
}

function setup() {
  const prisma: any = {
    user: { findUnique: jest.fn().mockResolvedValue({ isActive: true, tokenVersion: 0 }) },
    tableSession: { findUnique: jest.fn() },
  };
  const jwt: any = { verifyAsync: jest.fn().mockResolvedValue({ sub: 'u1' }) };
  const gateway = new EventsGateway(prisma, jwt);
  const emit = jest.fn();
  const disconnectSockets = jest.fn();
  const server: any = {
    to: jest.fn(() => ({ emit })),
    in: jest.fn(() => ({ disconnectSockets })),
    emit: jest.fn(),
  };
  (gateway as any).server = server;
  // log ระดับ warn/debug ไม่ต้องรกผลเทสต์
  (gateway as any).logger = { warn: jest.fn(), debug: jest.fn() };
  return { prisma, jwt, gateway, server, emit, disconnectSockets };
}

const rejected = (c: any) => {
  expect(c.disconnect).toHaveBeenCalledWith(true);
  expect(c.join).not.toHaveBeenCalled();
  return c.emit.mock.calls[0]?.[1]?.message as string;
};

describe('EventsGateway — handshake', () => {
  it('พนักงาน token ถูก → เข้าห้อง staff + ห้องของบัญชี', async () => {
    const { gateway } = setup();
    const c = client({ token: 'jwt' });
    await gateway.handleConnection(c);
    expect(c.join).toHaveBeenCalledWith(['staff', 'user:u1']);
    expect(c.data.userId).toBe('u1');
    expect(c.disconnect).not.toHaveBeenCalled();
  });

  it('JWT ปลอม/หมดอายุ → ตัดทิ้ง', async () => {
    const { gateway, jwt } = setup();
    jwt.verifyAsync.mockRejectedValue(new Error('jwt expired'));
    const c = client({ token: 'bad' });
    await gateway.handleConnection(c);
    expect(rejected(c)).toBe('jwt expired');
  });

  it.each([
    ['บัญชีถูกปิด', { isActive: false, tokenVersion: 0 }, { sub: 'u1' }],
    ['ถูกออกจากระบบทุกเครื่อง (tokenVersion เปลี่ยน)', { isActive: true, tokenVersion: 2 }, { sub: 'u1', tv: 1 }],
    ['บัญชีถูกลบ', null, { sub: 'u1' }],
  ])('%s → ตัดทิ้ง', async (_label, dbUser, payload) => {
    const { gateway, prisma, jwt } = setup();
    prisma.user.findUnique.mockResolvedValue(dbUser);
    jwt.verifyAsync.mockResolvedValue(payload);
    const c = client({ token: 'jwt' });
    await gateway.handleConnection(c);
    expect(rejected(c)).toContain('ปิดใช้งาน');
  });

  it('token เก่าที่ไม่มี tv ถือเป็นรุ่น 0', async () => {
    const { gateway, jwt } = setup();
    jwt.verifyAsync.mockResolvedValue({ sub: 'u1' });
    const c = client({ token: 'jwt' });
    await gateway.handleConnection(c);
    expect(c.join).toHaveBeenCalled();
  });

  it('ลูกค้า QR session เปิดอยู่ → เข้าห้องของ session เท่านั้น', async () => {
    const { gateway, prisma } = setup();
    prisma.tableSession.findUnique.mockResolvedValue({
      id: 's1',
      status: TableSessionStatus.OPEN,
      expiresAt: new Date(Date.now() + 60_000),
    });
    const c = client({ sessionToken: 'qr' });
    await gateway.handleConnection(c);
    expect(c.join).toHaveBeenCalledWith('session:s1');
    expect(c.data.sessionId).toBe('s1');
  });

  it.each([
    ['ไม่พบ session', null, 'ไม่พบ'],
    ['session ปิดแล้ว', { id: 's1', status: TableSessionStatus.CLOSED, expiresAt: null }, 'ปิดแล้ว'],
    [
      'session หมดอายุ',
      { id: 's1', status: TableSessionStatus.OPEN, expiresAt: new Date(Date.now() - 1000) },
      'หมดอายุ',
    ],
  ])('%s → ตัดทิ้ง', async (_label, session, msg) => {
    const { gateway, prisma } = setup();
    prisma.tableSession.findUnique.mockResolvedValue(session);
    const c = client({ sessionToken: 'qr' });
    await gateway.handleConnection(c);
    expect(rejected(c)).toContain(msg);
  });

  it.each([undefined, {}, { token: '' }, { token: 123 }, { sessionToken: '' }])(
    'handshake.auth = %j → ตัดทิ้ง',
    async (auth) => {
      const { gateway } = setup();
      const c = client(auth);
      await gateway.handleConnection(c);
      expect(rejected(c)).toContain('ต้อง login');
    },
  );

  // ทดสอบ: หน้าเว็บพนักงานไม่ส่ง token ใน auth แล้ว — ต้องยืนยันตัวจาก httpOnly cookie ที่ติดมากับ handshake
  // วิธี: handshake.auth ว่าง + header cookie มี restaurant_token → เช็กว่า verify token จาก cookie และเข้าห้อง staff
  it('ไม่มี auth แต่มี cookie ของพนักงาน → เข้าห้อง staff', async () => {
    const { gateway, jwt } = setup();
    const c = client({}, 'theme=dark; restaurant_token=cookie-jwt');
    await gateway.handleConnection(c);
    expect(jwt.verifyAsync).toHaveBeenCalledWith('cookie-jwt');
    expect(c.join).toHaveBeenCalledWith(['staff', 'user:u1']);
  });

  // ทดสอบ: เครื่องพนักงานเปิดหน้า QR ลูกค้า (มีทั้ง cookie และ sessionToken) ต้องได้ห้องของโต๊ะ ไม่ใช่ห้อง staff
  // วิธี: ส่ง sessionToken + cookie → เช็กว่า join ห้อง session และไม่ verify JWT เลย
  it('มีทั้ง sessionToken และ cookie → ใช้ sessionToken (ห้องลูกค้า)', async () => {
    const { gateway, prisma, jwt } = setup();
    prisma.tableSession.findUnique.mockResolvedValue({
      id: 's1',
      status: TableSessionStatus.OPEN,
      expiresAt: new Date(Date.now() + 60_000),
    });
    const c = client({ sessionToken: 'qr' }, 'restaurant_token=cookie-jwt');
    await gateway.handleConnection(c);
    expect(c.join).toHaveBeenCalledWith('session:s1');
    expect(jwt.verifyAsync).not.toHaveBeenCalled();
  });

  it('error ที่ไม่ใช่ Error object → ข้อความ unauthorized', async () => {
    const { gateway, jwt } = setup();
    jwt.verifyAsync.mockRejectedValue('weird');
    const c = client({ token: 'jwt' });
    await gateway.handleConnection(c);
    expect(rejected(c)).toBe('unauthorized');
  });

  it('handleDisconnect แค่ log', () => {
    const { gateway } = setup();
    expect(() => gateway.handleDisconnect(client({}))).not.toThrow();
  });
});

describe('EventsGateway — ส่ง event', () => {
  it('emitToStaff แปลง Decimal เป็น number ก่อนส่ง', () => {
    const { gateway, server, emit } = setup();
    gateway.emitToStaff('payment.created', { amount: new Prisma.Decimal('12.50') });
    expect(server.to).toHaveBeenCalledWith('staff');
    expect(emit).toHaveBeenCalledWith('payment.created', { amount: 12.5 });
  });

  it('emitToSession ไม่มี session → ไม่ส่ง', () => {
    const { gateway, server } = setup();
    gateway.emitToSession(null, 'order.updated', {});
    gateway.emitToSession(undefined, 'order.updated', {});
    expect(server.to).not.toHaveBeenCalled();
  });

  it('emitToStaffAndSession ส่งทั้งสองห้อง', () => {
    const { gateway, server } = setup();
    gateway.emitToStaffAndSession('s1', 'order.updated', { id: 'o1' });
    expect(server.to.mock.calls.map((c: unknown[]) => c[0])).toEqual(['staff', 'session:s1']);
  });

  it('emitToEveryone ส่งทุก socket', () => {
    const { gateway, server } = setup();
    gateway.emitToEveryone('menu.updated', { at: 'x' });
    expect(server.emit).toHaveBeenCalledWith('menu.updated', { at: 'x' });
  });

  it('disconnectUser ตัดทุก socket ของบัญชี', () => {
    const { gateway, server, disconnectSockets } = setup();
    gateway.disconnectUser('u1');
    expect(server.in).toHaveBeenCalledWith('user:u1');
    expect(disconnectSockets).toHaveBeenCalledWith(true);
  });

  it('ยังไม่มี server (เช่น ใน unit test อื่น/ก่อน init) → ไม่ throw', () => {
    const gateway = new EventsGateway({} as any, {} as any);
    expect(() => {
      gateway.emitToStaff('order.created', {});
      gateway.emitToEveryone('menu.updated', {});
      gateway.emitToSession('s1', 'order.created', {});
      gateway.disconnectUser('u1');
    }).not.toThrow();
  });
});

describe('SocketIoAdapter', () => {
  it('ใส่ CORS origin จาก env ทับ options ที่ส่งมา', () => {
    const adapter = new SocketIoAdapter({} as any, ['https://pos.test']);
    const parent = Object.getPrototypeOf(SocketIoAdapter.prototype);
    const spy = jest.spyOn(parent, 'createIOServer').mockReturnValue('server' as any);
    expect(adapter.createIOServer(3001, { path: '/ws' } as any)).toBe('server');
    expect(spy).toHaveBeenCalledWith(3001, {
      path: '/ws',
      cors: { origin: ['https://pos.test'], credentials: true },
    });
    spy.mockRestore();
  });
});
