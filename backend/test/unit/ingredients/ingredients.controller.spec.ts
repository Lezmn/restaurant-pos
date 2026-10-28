import { ForbiddenException } from '@nestjs/common';
import { Role } from '@prisma/client';
import { IngredientsController } from '../../../src/ingredients/ingredients.controller';
import { autoMock, describeDelegations, user } from '../helpers/controller';

const make = () => {
  const service = autoMock();
  return { controller: new IngredientsController(service as any), service };
};

describe('IngredientsController', () => {
  describeDelegations(make, [
    ['create', [{ name: 'ไข่' }], 'create', [{ name: 'ไข่' }]],
    ['findAll', [], 'findAll', []],
    ['findOne', ['i1'], 'findOne', ['i1']],
    ['update', ['i1', { isAvailable: false }, { user: user(Role.KITCHEN) }], 'update', ['i1', { isAvailable: false }]],
    ['remove', ['i1'], 'remove', ['i1']],
  ]);

  it.each([
    ['KITCHEN เปลี่ยนรูป', { imageUrl: '/uploads/a.webp' }],
    ['KITCHEN ลบรูป (null)', { imageUrl: null }],
  ])('%s → 403 (เฉพาะ ADMIN)', (_label, dto) => {
    const { controller, service } = make();
    expect(() => controller.update('i1', dto as any, { user: user(Role.KITCHEN) as any })).toThrow(ForbiddenException);
    expect(service.update).not.toHaveBeenCalled();
  });

  it('ADMIN เปลี่ยนรูปได้', () => {
    const { controller, service } = make();
    controller.update('i1', { imageUrl: '/uploads/a.webp' } as any, { user: user(Role.ADMIN) as any });
    expect(service.update).toHaveBeenCalledWith('i1', { imageUrl: '/uploads/a.webp' });
  });
});
