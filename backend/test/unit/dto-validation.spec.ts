import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { FindAuditLogsQueryDto } from '../../src/audit/dto/find-audit-logs-query.dto';
import { ChangePasswordDto } from '../../src/auth/dto/change-password.dto';
import { LoginDto } from '../../src/auth/dto/login.dto';
import { CashCloseDateQueryDto } from '../../src/cash-closes/dto/cash-close-date-query.dto';
import { CreateCashCloseDto } from '../../src/cash-closes/dto/create-cash-close.dto';
import { CreateExpenseDto } from '../../src/expenses/dto/create-expense.dto';
import { CreateIngredientDto } from '../../src/ingredients/dto/create-ingredient.dto';
import { TestLineSettingsDto, UpdateLineSettingsDto } from '../../src/line/dto/line-settings.dto';
import { CreateMenuItemDto } from '../../src/menu/dto/create-menu-item.dto';
import { CreateMenuOptionDto } from '../../src/menu/dto/create-menu-option.dto';
import { CreateOrderDto } from '../../src/orders/dto/create-order.dto';
import { CreateTakeawayOrderDto } from '../../src/orders/dto/create-takeaway-order.dto';
import { ConfirmSlipDto } from '../../src/payments/dto/confirm-slip.dto';
import { CreatePaymentDto } from '../../src/payments/dto/create-payment.dto';
import { FindPaymentsQueryDto } from '../../src/payments/dto/find-payments-query.dto';
import { VoidPaymentDto } from '../../src/payments/dto/void-payment.dto';
import { CreateCustomerOrderDto } from '../../src/public/dto/create-customer-order.dto';
import { ReportRangeQueryDto } from '../../src/reports/dto/report-range-query.dto';
import { CreateTableSessionDto } from '../../src/table-sessions/dto/create-table-session.dto';
import { CreateTableDto } from '../../src/tables/dto/create-table.dto';
import { FindTablesQueryDto } from '../../src/tables/dto/find-tables-query.dto';
import { CreateUserDto } from '../../src/users/dto/create-user.dto';
import { UpdateUserDto } from '../../src/users/dto/update-user.dto';

/** ตั้งค่าเดียวกับ main.ts — ตัด field ที่ไม่ได้ประกาศ + แปลง type */
const pipe = new ValidationPipe({ whitelist: true, transform: true });
const UUID = '3f1c2b7a-8d4e-4c1a-9b2f-0a1b2c3d4e5f';
const UUID2 = '7a2b3c4d-5e6f-4a1b-8c2d-3e4f5a6b7c8d';

async function check(metatype: any, value: unknown, type: 'body' | 'query' = 'body') {
  return pipe.transform(value, { type, metatype });
}

async function errorsOf(metatype: any, value: unknown, type: 'body' | 'query' = 'body'): Promise<string[]> {
  try {
    await check(metatype, value, type);
    return [];
  } catch (e) {
    expect(e).toBeInstanceOf(BadRequestException);
    return ((e as BadRequestException).getResponse() as { message: string[] }).message;
  }
}

const valid = async (metatype: any, value: unknown, type: 'body' | 'query' = 'body') =>
  expect(await errorsOf(metatype, value, type)).toEqual([]);
const invalid = async (metatype: any, value: unknown, field: string, type: 'body' | 'query' = 'body') => {
  const errors = await errorsOf(metatype, value, type);
  expect(errors.length).toBeGreaterThan(0);
  expect(errors.join(' | ')).toContain(field);
};

describe('DTO validation (ValidationPipe ตาม main.ts)', () => {
  describe('LoginDto / ChangePasswordDto', () => {
    it('อีเมลตัดช่องว่าง+ตัวเล็ก (แท็บเล็ตขึ้นตัวใหญ่ให้เอง)', async () => {
      await expect(check(LoginDto, { email: '  Admin@Shop.Test ', password: '12345678' })).resolves.toMatchObject({
        email: 'admin@shop.test',
      });
    });
    it('รหัสสั้นกว่า 8 / อีเมลผิดรูป → 400', async () => {
      await invalid(LoginDto, { email: 'a@x.test', password: 'short' }, 'password');
      await invalid(LoginDto, { email: 'not-email', password: '12345678' }, 'email');
      await invalid(ChangePasswordDto, { currentPassword: 'x', newPassword: 'short' }, 'newPassword');
    });
  });

  describe('CreateUserDto / UpdateUserDto', () => {
    const base = { name: ' ครัว ', email: ' Kitchen@Shop.Test', password: '12345678', role: 'KITCHEN' };
    it('trim ชื่อ อีเมลเป็นตัวเล็ก', async () => {
      await expect(check(CreateUserDto, base)).resolves.toMatchObject({ name: 'ครัว', email: 'kitchen@shop.test' });
    });
    it.each([
      [{ name: '   ' }, 'name'],
      [{ role: 'OWNER' }, 'role'],
      [{ password: 'x'.repeat(73) }, 'password'],
    ])('%j → 400', async (patch, field) => {
      await invalid(CreateUserDto, { ...base, ...patch }, field);
    });
    it('แก้บางฟิลด์ได้ (PartialType) และตัด field แปลกปลอม (กันยิง tokenVersion/mustChangePassword ตรง ๆ)', async () => {
      const out: any = await check(UpdateUserDto, { isActive: false, tokenVersion: 99, mustChangePassword: false });
      expect(out).toEqual({ isActive: false });
    });
  });

  describe('CreatePaymentDto', () => {
    it('ทั้งโต๊ะ + ส่วนลด + expectedTotal จาก string ถูกแปลงเป็นตัวเลข', async () => {
      const out: any = await check(CreatePaymentDto, {
        tableSessionId: 'migrated-payment-1',
        method: 'CASH',
        discountPercent: '10',
        expectedTotal: '235.50',
        slipPayload: '  QR  ',
      });
      expect(out).toMatchObject({ discountPercent: 10, expectedTotal: 235.5, slipPayload: 'QR' });
    });

    it.each([
      [{ method: 'CARD' }, 'method'], // enum ใน DB ยังมี CARD แต่ไม่รับใหม่
      [{ discountPercent: 0 }, 'discountPercent'],
      [{ discountPercent: 101 }, 'discountPercent'],
      [{ discountPercent: 5.5 }, 'discountPercent'],
      [{ splitParts: 1 }, 'splitParts'],
      [{ splitParts: 21 }, 'splitParts'],
      [{ expectedTotal: 1.234 }, 'expectedTotal'],
      [{ expectedTotal: -1 }, 'expectedTotal'],
      [{ orderIds: [] }, 'orderIds'],
      [{ orderIds: ['not-uuid'] }, 'orderIds'],
      [{ items: [{ orderItemId: UUID, quantity: 0 }] }, 'quantity'],
      [{ items: [{ orderItemId: 'x', quantity: 1 }] }, 'orderItemId'],
      [{ slipPayload: '   ' }, 'slipPayload'],
      [{ slipOverrideReason: 'x'.repeat(201) }, 'slipOverrideReason'],
      [{ note: 'x'.repeat(501) }, 'note'],
    ])('%j → 400', async (patch, field) => {
      await invalid(CreatePaymentDto, { tableSessionId: 's', method: 'CASH', ...patch }, field);
    });

    it('เลือกรายการ: items ซ้อนถูก validate', async () => {
      await valid(CreatePaymentDto, { method: 'PROMPTPAY', items: [{ orderItemId: UUID, quantity: '2' }] });
    });
  });

  it.each([VoidPaymentDto, ConfirmSlipDto])('%p: เหตุผลช่องว่างล้วน → 400', async (dto) => {
    const errors = await errorsOf(dto, { reason: '   ' });
    expect(errors.join()).toMatch(/ต้องระบุเหตุผล/);
    await valid(dto, { reason: ' จ่ายผิดโต๊ะ ' });
  });

  describe('ออเดอร์', () => {
    const item = { menuItemId: UUID, quantity: 1 };
    it('ออเดอร์พนักงาน + รายการราคาเปิด', async () => {
      await valid(CreateOrderDto, {
        tableId: UUID,
        items: [{ ...item, optionIds: [UUID2] }],
        customItems: [{ name: ' ข้าวเปล่า ', price: 10, quantity: 2 }],
      });
    });
    it.each([
      [{ items: [{ ...item, quantity: 100 }] }, 'quantity'],
      [{ items: [{ ...item, quantity: 0 }] }, 'quantity'],
      [{ items: [{ ...item, optionIds: [UUID2, UUID2] }] }, 'optionIds'],
      [{ items: [{ ...item, note: 'x'.repeat(201) }] }, 'note'],
      [{ customItems: [{ name: '  ', price: 10, quantity: 1 }] }, 'name'],
      [{ customItems: [{ name: 'x', price: 100_001, quantity: 1 }] }, 'price'],
      [{ customItems: [{ name: 'x', price: 1.555, quantity: 1 }] }, 'price'],
      [{ items: Array.from({ length: 51 }, () => item) }, 'items'],
    ])('%j → 400', async (patch, field) => {
      await invalid(CreateOrderDto, { tableId: UUID, items: [item], ...patch }, field);
    });

    it('ลูกค้า QR สั่งได้แค่เมนู (customItems ถูกตัดทิ้ง ตั้งราคาเองไม่ได้) และต้องมีอย่างน้อย 1 รายการ', async () => {
      const out: any = await check(CreateCustomerOrderDto, {
        sessionToken: 'tok',
        items: [item],
        customItems: [{ name: 'ฟรี', price: 0, quantity: 1 }],
      });
      expect(out.customItems).toBeUndefined();
      await invalid(CreateCustomerOrderDto, { sessionToken: 'tok', items: [] }, 'items');
    });

    it('กลับบ้าน: trim ชื่อลูกค้า / ยาวเกิน 60 → 400', async () => {
      await expect(check(CreateTakeawayOrderDto, { customerName: ' คุณเอ ', items: [item] })).resolves.toMatchObject({
        customerName: 'คุณเอ',
      });
      await invalid(CreateTakeawayOrderDto, { customerName: 'x'.repeat(61), items: [item] }, 'customerName');
    });
  });

  describe('เมนู / วัตถุดิบ / โต๊ะ', () => {
    it('เมนู: ชื่อช่องว่างล้วน / ราคาติดลบ / categoryId ผิด → 400', async () => {
      const base = { name: 'ผัดไทย', price: 50, categoryId: UUID };
      await valid(CreateMenuItemDto, base);
      await invalid(CreateMenuItemDto, { ...base, name: '  ' }, 'name');
      await invalid(CreateMenuItemDto, { ...base, price: -1 }, 'price');
      await invalid(CreateMenuItemDto, { ...base, categoryId: 'x' }, 'categoryId');
      await invalid(CreateMenuItemDto, { ...base, ingredientIds: [UUID, UUID] }, 'ingredientIds');
    });

    it('ตัวเลือก: ราคาเป็น string ถูกแปลง / usageQty เกิน 99 → 400', async () => {
      await expect(check(CreateMenuOptionDto, { name: 'ไข่ดาว', price: '10' })).resolves.toMatchObject({ price: 10 });
      await invalid(CreateMenuOptionDto, { name: 'x', usageQty: 100 }, 'usageQty');
      await invalid(CreateMenuOptionDto, { name: 'x', group: 'NOPE' }, 'group');
    });

    it('วัตถุดิบ: รูปต้องเป็น http(s) หรือ /uploads, null = เอารูปออก, สต็อกติดลบ → 400', async () => {
      await valid(CreateIngredientDto, { name: 'ไข่', imageUrl: '/uploads/egg.webp', stockQty: 0 });
      await valid(CreateIngredientDto, { name: 'ไข่', imageUrl: null, stockQty: null });
      await invalid(CreateIngredientDto, { name: 'ไข่', imageUrl: 'javascript:alert(1)' }, 'imageUrl');
      await invalid(CreateIngredientDto, { name: 'ไข่', stockQty: -1 }, 'stockQty');
      await invalid(CreateIngredientDto, { name: 'ไข่', stockQty: 1.5 }, 'stockQty');
    });

    it('โต๊ะ: เลขโต๊ะ ≥ 1 / query includeInactive รับ "true" เป็น boolean', async () => {
      await invalid(CreateTableDto, { number: 0 }, 'number');
      await expect(check(FindTablesQueryDto, { includeInactive: 'true' }, 'query')).resolves.toEqual({
        includeInactive: true,
      });
      await expect(check(FindTablesQueryDto, { includeInactive: 'yes' }, 'query')).resolves.toEqual({
        includeInactive: false,
      });
      await invalid(FindTablesQueryDto, { status: 'BROKEN' }, 'status', 'query');
    });

    it('เปิดโต๊ะ: จำนวนลูกค้า 1–99, expiresAt ต้องเป็น ISO', async () => {
      await valid(CreateTableSessionDto, { tableId: UUID, guestCount: 4, expiresAt: '2026-05-01T12:00:00Z' });
      await invalid(CreateTableSessionDto, { tableId: UUID, guestCount: 100 }, 'guestCount');
      await invalid(CreateTableSessionDto, { tableId: UUID, expiresAt: 'tomorrow' }, 'expiresAt');
    });
  });

  describe('เงินสด / รายจ่าย / รายงาน', () => {
    it('ปิดยอด: วันที่ YYYY-MM-DD จริง, เงินทศนิยมไม่เกิน 2 ตำแหน่ง', async () => {
      await valid(CreateCashCloseDto, { date: '2026-02-28', openingFloat: '500', countedCash: 1234.5 });
      await invalid(CreateCashCloseDto, { date: '2026-13-01', openingFloat: 0, countedCash: 0 }, 'date');
      await invalid(CreateCashCloseDto, { openingFloat: 0, countedCash: 1.005 }, 'countedCash');
      await invalid(CreateCashCloseDto, { openingFloat: -1, countedCash: 0 }, 'openingFloat');
      await invalid(CashCloseDateQueryDto, { date: '2026-1-1' }, 'date', 'query');
    });

    it('รายจ่าย: หมวดต้องอยู่ใน enum, ยอดติดลบ → 400', async () => {
      await valid(CreateExpenseDto, { title: 'ผัก', amount: '80.50', category: 'INGREDIENTS' });
      await invalid(CreateExpenseDto, { title: 'ผัก', amount: 1, category: 'FOOD' }, 'category');
      await invalid(CreateExpenseDto, { title: 'ผัก', amount: -1, category: 'OTHER' }, 'amount');
    });

    it('รายงาน: month ต้อง YYYY-MM (01–12)', async () => {
      await valid(ReportRangeQueryDto, { month: '2026-12' }, 'query');
      await invalid(ReportRangeQueryDto, { month: '2026-13' }, 'month', 'query');
      await invalid(ReportRangeQueryDto, { from: 'yesterday' }, 'from', 'query');
    });

    it('ประวัติ: limit 1–200 แปลงจาก query string, action ต้องเป็นที่รู้จัก', async () => {
      await expect(check(FindAuditLogsQueryDto, { limit: '50' }, 'query')).resolves.toEqual({ limit: 50 });
      await invalid(FindAuditLogsQueryDto, { limit: '500' }, 'limit', 'query');
      await invalid(FindAuditLogsQueryDto, { action: 'DROP_TABLE' }, 'action', 'query');
    });

    it('บิล: slipIssues รับ "true"', async () => {
      await expect(check(FindPaymentsQueryDto, { slipIssues: 'true' }, 'query')).resolves.toEqual({ slipIssues: true });
    });
  });

  describe('LINE', () => {
    const to = `U${'a'.repeat(32)}`;
    it('ปลายทางต้องเป็น U/C/R + hex 32 ตัว, token 20–1000 ตัว', async () => {
      await valid(UpdateLineSettingsDto, { enabled: true, to: ` ${to} `, token: 't'.repeat(40) });
      await invalid(UpdateLineSettingsDto, { enabled: true, to: 'U123' }, 'User ID');
      await invalid(UpdateLineSettingsDto, { enabled: true, to, token: 'short' }, 'token');
      await invalid(UpdateLineSettingsDto, { enabled: 'yes', to }, 'enabled');
    });

    it('ทดสอบส่ง: ไม่ส่งอะไรเลยก็ได้ (ใช้ค่าที่บันทึก)', async () => {
      await valid(TestLineSettingsDto, {});
      await invalid(TestLineSettingsDto, { to: 'Cxyz' }, 'User ID');
    });
  });
});
