import { Role } from '@prisma/client';
import { UsersController } from '../../../src/users/users.controller';
import { auditOf, autoMock, describeDelegations, user } from '../helpers/controller';

const admin = user(Role.ADMIN);

describe('UsersController', () => {
  describeDelegations(
    () => {
      const service = autoMock();
      return { controller: new UsersController(service as any), service };
    },
    [
      ['create', [{ email: 'k@x', role: 'KITCHEN' }], 'create', [{ email: 'k@x', role: 'KITCHEN' }]],
      ['findAll', [{ role: 'STAFF' }], 'findAll', ['STAFF']],
      ['findOne', ['u1'], 'findOne', ['u1']],
      // ส่ง id ของคนที่กดด้วย — service ใช้กันแอดมินลดสิทธิ์/ปิดบัญชีตัวเอง
      ['update', ['u1', { name: 'n' }, { user: admin }], 'update', ['u1', { name: 'n' }, admin.id]],
      ['remove', ['u1', { user: admin }], 'remove', ['u1', admin.id]],
    ],
  );

  it('ประวัติแก้บัญชีไม่เก็บรหัสผ่าน เก็บแค่ว่าเปลี่ยน', () => {
    const audit = auditOf(UsersController, 'update')!;
    const details = audit.details!({
      before: { name: 'a' },
      body: { name: 'b', password: 'new-secret' },
    } as any);
    expect(details).toEqual({ before: { name: 'a' }, changes: { name: 'b', passwordChanged: true } });
    expect(JSON.stringify(details)).not.toContain('new-secret');
    expect(auditOf(UsersController, 'create')!.targetId!({ result: { id: 'u9' } } as any)).toBe('u9');
    expect(auditOf(UsersController, 'remove')!.details!({ before: { email: 'x' } } as any)).toEqual({ email: 'x' });
  });
});
