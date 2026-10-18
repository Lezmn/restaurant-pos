import 'dotenv/config';
import {
  ExpenseCategory,
  MenuOptionGroup,
  OrderStatus,
  PaymentMethod,
  Prisma,
  PrismaClient,
  Role,
  ServiceRequestStatus,
  ServiceRequestType,
  TableSessionStatus,
  TableStatus,
} from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();
const seedPassword = 'ChangeMe123!';

async function upsertUser(email: string, name: string, role: Role) {
  const password = await bcrypt.hash(seedPassword, 12);

  return prisma.user.upsert({
    where: { email },
    update: { name, role, password },
    create: { email, name, role, password },
  });
}

async function upsertCategory(name: string) {
  return prisma.category.upsert({
    where: { name },
    update: {},
    create: { name },
  });
}

async function upsertMenuItem(data: {
  categoryId: string;
  name: string;
  price: number;
  imageUrl?: string;
}) {
  const existing = await prisma.menuItem.findFirst({
    where: {
      categoryId: data.categoryId,
      name: data.name,
    },
  });

  if (existing) {
    return prisma.menuItem.update({
      where: { id: existing.id },
      data: {
        price: data.price,
        imageUrl: data.imageUrl,
        isAvailable: true,
      },
    });
  }

  return prisma.menuItem.create({
    data: {
      categoryId: data.categoryId,
      name: data.name,
      price: data.price,
      imageUrl: data.imageUrl,
      isAvailable: true,
    },
  });
}

async function upsertIngredient(name: string) {
  return prisma.ingredient.upsert({
    where: { name },
    update: {},
    create: { name },
  });
}

async function upsertMenuOption(
  menuItemId: string,
  name: string,
  price = 0,
  group: MenuOptionGroup = MenuOptionGroup.EXTRA,
) {
  const existing = await prisma.menuOption.findFirst({
    where: { menuItemId, name },
  });

  // ตัวเลือกที่ชื่อตรงกับวัตถุดิบ (หมู/ไก่/กุ้ง/ไข่ดาว) ผูกให้อัตโนมัติ
  // ของหมดทีเดียวหายทุกเมนู ไม่ต้องไล่ปิดเอง
  const ingredient = await prisma.ingredient.findUnique({ where: { name } });
  const ingredientId = ingredient?.id ?? null;

  if (existing) {
    return prisma.menuOption.update({
      where: { id: existing.id },
      data: { price, group, isAvailable: true, ingredientId },
    });
  }

  return prisma.menuOption.create({
    data: { menuItemId, name, price, group, isAvailable: true, ingredientId },
  });
}

async function upsertTable(number: number, seats = 4) {
  return prisma.restaurantTable.upsert({
    where: { number },
    update: { seats, status: TableStatus.AVAILABLE },
    create: { number, seats, status: TableStatus.AVAILABLE },
  });
}

async function upsertServiceRequest(data: {
  tableId: string;
  tableSessionId?: string;
  type: ServiceRequestType;
  status?: ServiceRequestStatus;
}) {
  const existing = await prisma.serviceRequest.findFirst({
    where: {
      tableId: data.tableId,
      tableSessionId: data.tableSessionId,
      type: data.type,
    },
  });

  if (existing) {
    return prisma.serviceRequest.update({
      where: { id: existing.id },
      data: {
        status: data.status ?? ServiceRequestStatus.PENDING,
        resolvedAt:
          data.status === ServiceRequestStatus.RESOLVED ? new Date() : null,
      },
    });
  }

  return prisma.serviceRequest.create({
    data: {
      tableId: data.tableId,
      tableSessionId: data.tableSessionId,
      type: data.type,
      status: data.status ?? ServiceRequestStatus.PENDING,
      resolvedAt:
        data.status === ServiceRequestStatus.RESOLVED ? new Date() : undefined,
    },
  });
}

async function upsertDemoOrder(params: {
  tableId: string;
  tableSessionId: string;
  status: OrderStatus;
  items: {
    menuItemId: string;
    quantity: number;
    unitPrice: number;
    note?: string;
  }[];
}) {
  const existing = await prisma.order.findFirst({
    where: { tableSessionId: params.tableSessionId, status: params.status },
  });
  if (existing) return existing;

  return prisma.order.create({
    data: {
      tableId: params.tableId,
      tableSessionId: params.tableSessionId,
      status: params.status,
      items: { create: params.items },
    },
  });
}

async function createReceiptForSession(tableSessionId: string) {
  const existingReceipt = await prisma.receipt.findFirst({
    where: { tableSessionId },
  });
  if (existingReceipt) return existingReceipt;

  const session = await prisma.tableSession.findUnique({
    where: { id: tableSessionId },
    include: {
      table: true,
      payments: true,
      orders: {
        include: {
          items: {
            include: {
              menuItem: true,
              selectedOptions: true,
            },
          },
        },
      },
    },
  });

  const payment = session?.payments[0];
  if (!payment) return null;

  const items = session.orders.flatMap((order) =>
    order.items.map((item) => {
      const optionTotal = item.selectedOptions.reduce(
        (sum, option) => sum.plus(option.price),
        new Prisma.Decimal(0),
      );
      const lineTotal = item.unitPrice.plus(optionTotal).mul(item.quantity);

      return {
        name: item.menuItem.name,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        optionTotal,
        lineTotal,
        note: item.note,
        orderId: order.id,
      };
    }),
  );

  const subtotal = items.reduce(
    (sum, item) => sum.plus(item.lineTotal),
    new Prisma.Decimal(0),
  );

  return prisma.receipt.create({
    data: {
      number: `RCPT-${Date.now()}`,
      paymentId: payment.id,
      tableId: session.tableId,
      tableSessionId: session.id,
      subtotal,
      discount: 0,
      total: payment.amount,
      items: { create: items },
    },
  });
}

/** รายจ่ายตัวอย่างของเดือนนี้ ให้หน้า report มีข้อมูลให้ดู */
async function seedExpenses() {
  const now = new Date();
  const daysAgo = (days: number) => {
    const date = new Date(now);
    date.setDate(date.getDate() - days);
    return date;
  };

  const samples = [
    { title: 'ค่าวัตถุดิบตลาดสด', amount: 2500, category: ExpenseCategory.INGREDIENTS, spentAt: daysAgo(0) },
    { title: 'ค่าไฟฟ้า', amount: 3200, category: ExpenseCategory.UTILITIES, spentAt: daysAgo(2) },
    { title: 'เงินเดือนพนักงาน', amount: 18000, category: ExpenseCategory.SALARY, spentAt: daysAgo(3) },
    { title: 'ค่าเช่าร้าน', amount: 15000, category: ExpenseCategory.RENT, spentAt: daysAgo(5) },
    { title: 'ซื้อกระทะใหม่', amount: 1200, category: ExpenseCategory.EQUIPMENT, spentAt: daysAgo(6) },
  ];

  for (const sample of samples) {
    const existing = await prisma.expense.findFirst({
      where: { title: sample.title, category: sample.category },
    });
    if (existing) continue;
    await prisma.expense.create({ data: sample });
  }
}

async function main() {
  const [admin] = await Promise.all([
    upsertUser('admin@restaurant.local', 'Admin', Role.ADMIN),
    upsertUser('staff@restaurant.local', 'Staff', Role.STAFF),
    upsertUser('kitchen@restaurant.local', 'Kitchen Staff', Role.KITCHEN),
  ]);

  // ต้องมาก่อนตัวเลือกเมนู เพราะ upsertMenuOption จะไปหาวัตถุดิบชื่อเดียวกันมาผูกให้
  await Promise.all(
    ['หมู', 'ไก่', 'หมูกรอบ', 'กุ้ง', 'ไข่ดาว', 'ไข่เจียว'].map(upsertIngredient),
  );

  const [riceCategory, noodleCategory, drinkCategory] = await Promise.all([
    upsertCategory('อาหารจานเดียว'),
    upsertCategory('เมนูเส้น'),
    upsertCategory('เครื่องดื่ม'),
    upsertCategory('ของหวาน'),
  ]);

  const [gaprao, omeletRice, friedRice, padSeeEw, water] = await Promise.all([
    upsertMenuItem({
      categoryId: riceCategory.id,
      name: 'ข้าวผัดกะเพรา',
      price: 50,
      imageUrl: 'https://images.unsplash.com/photo-1627308595229-7830a5c91f9f',
    }),
    upsertMenuItem({
      categoryId: riceCategory.id,
      name: 'ข้าวไข่เจียว',
      price: 40,
      imageUrl: 'https://images.unsplash.com/photo-1565299624946-b28f40a0ae38',
    }),
    upsertMenuItem({
      categoryId: riceCategory.id,
      name: 'ข้าวผัด',
      price: 50,
      imageUrl: 'https://images.unsplash.com/photo-1603133872878-684f208fb84b',
    }),
    upsertMenuItem({
      categoryId: noodleCategory.id,
      name: 'ผัดซีอิ๊ว',
      price: 50,
      imageUrl: 'https://images.unsplash.com/photo-1555126634-323283e090fa',
    }),
    upsertMenuItem({
      categoryId: drinkCategory.id,
      name: 'น้ำเปล่า',
      price: 10,
      imageUrl: 'https://images.unsplash.com/photo-1523362628745-0c100150b504',
    }),
  ]);

  const PROTEIN = MenuOptionGroup.PROTEIN;
  const EXTRA = MenuOptionGroup.EXTRA;

  const [gapraoPork, gapraoEgg] = await Promise.all([
    upsertMenuOption(gaprao.id, 'หมู', 0, PROTEIN),
    upsertMenuOption(gaprao.id, 'ไก่', 0, PROTEIN),
    upsertMenuOption(gaprao.id, 'หมูกรอบ', 10, PROTEIN),
    upsertMenuOption(gaprao.id, 'กุ้ง', 20, PROTEIN),
    upsertMenuOption(gaprao.id, 'ไข่ดาว', 10, EXTRA),
    upsertMenuOption(gaprao.id, 'ไข่เจียว', 10, EXTRA),
    upsertMenuOption(gaprao.id, 'พิเศษ', 10, EXTRA),
  ]);

  await Promise.all([
    upsertMenuOption(omeletRice.id, 'ไข่ 1 ฟอง', 0, EXTRA),
    upsertMenuOption(omeletRice.id, 'ไข่ 2 ฟอง', 10, EXTRA),
    upsertMenuOption(omeletRice.id, 'หมูสับ', 10, PROTEIN),
    upsertMenuOption(friedRice.id, 'หมู', 0, PROTEIN),
    upsertMenuOption(friedRice.id, 'ไก่', 0, PROTEIN),
    upsertMenuOption(friedRice.id, 'กุ้ง', 20, PROTEIN),
    upsertMenuOption(friedRice.id, 'ไข่ดาว', 10, EXTRA),
    upsertMenuOption(friedRice.id, 'พิเศษ', 10, EXTRA),
    upsertMenuOption(padSeeEw.id, 'หมู', 0, PROTEIN),
    upsertMenuOption(padSeeEw.id, 'ไก่', 0, PROTEIN),
    upsertMenuOption(padSeeEw.id, 'กุ้ง', 20, PROTEIN),
    upsertMenuOption(padSeeEw.id, 'พิเศษ', 10, EXTRA),
  ]);

  const tables = await Promise.all([
    upsertTable(1, 4),
    upsertTable(2, 4),
    upsertTable(3, 2),
    upsertTable(4, 6),
    upsertTable(5, 4),
    upsertTable(6, 8),
  ]);

  const demoSession = await prisma.tableSession.upsert({
    where: { token: 'demo-table-2-session' },
    update: {
      tableId: tables[1].id,
      status: TableSessionStatus.OPEN,
      closedAt: null,
      expiresAt: null,
    },
    create: {
      tableId: tables[1].id,
      token: 'demo-table-2-session',
      status: TableSessionStatus.OPEN,
    },
  });
  await prisma.restaurantTable.update({
    where: { id: tables[1].id },
    data: { status: TableStatus.OCCUPIED },
  });

  const demoPaidSession = await prisma.tableSession.upsert({
    where: { token: 'demo-table-1-paid-session' },
    update: {
      tableId: tables[0].id,
      status: TableSessionStatus.CLOSED,
      closedAt: new Date(),
      expiresAt: null,
    },
    create: {
      tableId: tables[0].id,
      token: 'demo-table-1-paid-session',
      status: TableSessionStatus.CLOSED,
      closedAt: new Date(),
    },
  });

  const existingPaidDemoOrder = await prisma.order.findFirst({
    where: { tableSessionId: demoPaidSession.id },
  });

  if (!existingPaidDemoOrder) {
    await prisma.order.create({
      data: {
        tableId: tables[0].id,
        tableSessionId: demoPaidSession.id,
        status: OrderStatus.PAID,
        items: {
          create: [
            {
              menuItemId: gaprao.id,
              quantity: 1,
              unitPrice: 50,
              note: 'ไม่เผ็ด',
              selectedOptions: {
                create: [
                  {
                    menuOptionId: gapraoPork.id,
                    name: gapraoPork.name,
                    price: gapraoPork.price,
                  },
                  {
                    menuOptionId: gapraoEgg.id,
                    name: gapraoEgg.name,
                    price: gapraoEgg.price,
                  },
                ],
              },
            },
            {
              menuItemId: water.id,
              quantity: 1,
              unitPrice: 10,
            },
          ],
        },
      },
    });
  }

  const existingDemoPayment = await prisma.payment.findFirst({
    where: { tableSessionId: demoPaidSession.id },
  });
  const demoPayment =
    existingDemoPayment ??
    (await prisma.payment.create({
      data: {
        tableSessionId: demoPaidSession.id,
        amount: 70,
        method: PaymentMethod.CASH,
      },
    }));

  // ผูกออเดอร์ที่จ่ายแล้วเข้ากับบิล เพื่อให้ยกเลิกบิล/แยกบิลทำงานถูกต้อง
  await prisma.order.updateMany({
    where: { tableSessionId: demoPaidSession.id, paymentId: null },
    data: { paymentId: demoPayment.id },
  });

  await Promise.all([
    upsertServiceRequest({
      tableId: tables[1].id,
      tableSessionId: demoSession.id,
      type: ServiceRequestType.CALL_STAFF,
    }),
    upsertServiceRequest({
      tableId: tables[1].id,
      tableSessionId: demoSession.id,
      type: ServiceRequestType.CHECKOUT,
    }),
  ]);

  // Give the open demo session (table 2) one order in each kitchen-board
  // status, so the queue / preparing / served columns all have data.
  await upsertDemoOrder({
    tableId: tables[1].id,
    tableSessionId: demoSession.id,
    status: OrderStatus.PENDING,
    items: [{ menuItemId: gaprao.id, quantity: 1, unitPrice: 50, note: 'เผ็ดน้อย' }],
  });
  await upsertDemoOrder({
    tableId: tables[1].id,
    tableSessionId: demoSession.id,
    status: OrderStatus.PREPARING,
    items: [{ menuItemId: friedRice.id, quantity: 2, unitPrice: 50 }],
  });
  await upsertDemoOrder({
    tableId: tables[1].id,
    tableSessionId: demoSession.id,
    status: OrderStatus.SERVED,
    items: [{ menuItemId: water.id, quantity: 2, unitPrice: 10 }],
  });

  // A second open session (table 4) whose orders are all SERVED, so the
  // Check/checkout screen has a table that's actually ready to pay.
  const demoReadySession = await prisma.tableSession.upsert({
    where: { token: 'demo-table-4-ready-session' },
    update: {
      tableId: tables[3].id,
      status: TableSessionStatus.OPEN,
      closedAt: null,
    },
    create: {
      tableId: tables[3].id,
      token: 'demo-table-4-ready-session',
      status: TableSessionStatus.OPEN,
    },
  });
  await prisma.restaurantTable.update({
    where: { id: tables[3].id },
    data: { status: TableStatus.OCCUPIED },
  });
  await upsertDemoOrder({
    tableId: tables[3].id,
    tableSessionId: demoReadySession.id,
    status: OrderStatus.SERVED,
    items: [
      { menuItemId: padSeeEw.id, quantity: 1, unitPrice: 50 },
      { menuItemId: water.id, quantity: 2, unitPrice: 10 },
    ],
  });

  await createReceiptForSession(demoPaidSession.id);

  await seedExpenses();

  console.log('Seed completed');
  console.table([
    { role: admin.role, email: admin.email, password: seedPassword },
    { role: Role.STAFF, email: 'staff@restaurant.local', password: seedPassword },
    { role: Role.KITCHEN, email: 'kitchen@restaurant.local', password: seedPassword },
  ]);
  console.log('Created sample categories, menu items, menu options, tables, QR sessions (open with mixed-status orders, open ready-to-pay, and closed/paid), service requests, and a receipt for a paid order.');
  console.log(`Demo QR session token (table 2, PENDING/PREPARING/SERVED orders): ${demoSession.token}`);
  console.log(`Demo ready-to-pay session token (table 4, all SERVED): ${demoReadySession.token}`);
  console.log(`Demo paid session token (table 1, closed): ${demoPaidSession.token}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
