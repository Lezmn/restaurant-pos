import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  OrderStatus,
  Prisma,
  ServiceRequestStatus,
  ServiceRequestType,
  TableSessionStatus,
  TableStatus,
} from '@prisma/client';
import { randomBytes } from 'node:crypto';
import { EventsGateway } from '../events/events.gateway';
import { PrismaService } from '../prisma/prisma.service';
import { CreateTableSessionDto } from './dto/create-table-session.dto';
import { countUnpaidOrders, isUniqueViolation } from './session-settlement';

const DEFAULT_SESSION_TTL_MS = 3 * 60 * 60 * 1000;

@Injectable()
export class TableSessionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventsGateway,
  ) {}

  async create(dto: CreateTableSessionDto) {
    const expiresAt = dto.expiresAt
      ? new Date(dto.expiresAt)
      : new Date(Date.now() + DEFAULT_SESSION_TTL_MS);
    if (expiresAt <= new Date()) {
      throw new BadRequestException('expiresAt ต้องเป็นเวลาในอนาคต');
    }

    const session = await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const table = await tx.restaurantTable.findUnique({
        where: { id: dto.tableId },
      });
      if (!table) {
        throw new NotFoundException(`ไม่พบโต๊ะ id: ${dto.tableId}`);
      }

      const activeSession = await tx.tableSession.findFirst({
        where: { tableId: dto.tableId, status: TableSessionStatus.OPEN },
      });

      if (activeSession) {
        const isExpired =
          !!activeSession.expiresAt && activeSession.expiresAt < new Date();
        if (!isExpired) {
          throw new ConflictException('โต๊ะนี้มี QR session ที่เปิดอยู่แล้ว');
        }

        // session เก่าหมดอายุแล้วแต่ยังไม่มีใครปิด — เก็บกวาดให้ก่อนเปิดใบใหม่
        // แต่ถ้ายังมีออเดอร์ค้างจ่าย ต้องเคลียร์เงินก่อน ไม่งั้นบิลจะหาย
        const unpaidCount = await tx.order.count({
          where: {
            tableSessionId: activeSession.id,
            status: { not: OrderStatus.CANCELLED },
            paymentId: null,
          },
        });
        if (unpaidCount > 0) {
          throw new ConflictException(
            'QR session เดิมของโต๊ะนี้หมดอายุแล้วแต่ยังมีออเดอร์ค้างชำระ ต้องเก็บเงินหรือยกเลิกออเดอร์ก่อน',
          );
        }

        await tx.tableSession.update({
          where: { id: activeSession.id },
          data: { status: TableSessionStatus.EXPIRED },
        });
      }
      // ตั้งใจไม่เช็ค table.status ตรงนี้: "มี session เปิดอยู่ไหม" คือความจริงเดียว
      // ถ้าโต๊ะค้างเป็น OCCUPIED ทั้งที่ไม่มี session เปิด แปลว่าสถานะค้างจากรอบก่อน
      // ปล่อยให้เปิดใบใหม่ได้เลย ไม่งั้นโต๊ะจะติดค้างถาวรจนต้องไปแก้ DB มือ

      const session = await tx.tableSession
        .create({
          data: {
            tableId: dto.tableId,
            token: this.generateToken(),
            expiresAt,
          },
          include: { table: true },
        })
        .catch((e: unknown) => {
          // อีกเครื่องเปิดโต๊ะนี้ไปพร้อมกันพอดี — ผ่านเช็คด้านบนทั้งคู่ แต่ unique index ของ DB กันไว้
          throw isUniqueViolation(e)
            ? new ConflictException('โต๊ะนี้มี QR session ที่เปิดอยู่แล้ว')
            : e;
        });

      await tx.restaurantTable.update({
        where: { id: dto.tableId },
        data: { status: TableStatus.OCCUPIED },
      });

      return session;
    });

    this.events.emitToStaff('table-session.created', {
      id: session.id,
      status: session.status,
      tableId: session.tableId,
    });
    return session;
  }

  async findAll(status?: TableSessionStatus) {
    const sessions = await this.prisma.tableSession.findMany({
      where: { status },
      include: {
        table: true,
        orders: {
          include: { items: { include: { selectedOptions: true } } },
        },
        serviceRequests: {
          where: {
            type: ServiceRequestType.CHECKOUT,
            status: ServiceRequestStatus.PENDING,
          },
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
      orderBy: { openedAt: 'desc' },
    });

    return sessions.map((session) => this.toSessionSummary(session));
  }

  async findOne(id: string) {
    const session = await this.prisma.tableSession.findUnique({
      where: { id },
      include: {
        table: true,
        orders: {
          include: { items: { include: { selectedOptions: true } } },
          orderBy: { createdAt: 'desc' },
        },
        serviceRequests: {
          where: {
            type: ServiceRequestType.CHECKOUT,
            status: ServiceRequestStatus.PENDING,
          },
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
    });
    if (!session) {
      throw new NotFoundException(`ไม่พบ QR session id: ${id}`);
    }
    return this.toSessionSummary(session);
  }

  async close(id: string) {
    const session = await this.findOne(id);
    if (session.status !== TableSessionStatus.OPEN) {
      return session;
    }

    await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const openOrderCount = await tx.order.count({
        where: {
          tableSessionId: id,
          status: {
            in: [OrderStatus.PENDING, OrderStatus.PREPARING, OrderStatus.SERVED],
          },
        },
      });

      if (openOrderCount > 0) {
        throw new ConflictException('ยังมีออเดอร์ที่ไม่ปิดใน session นี้');
      }

      await tx.tableSession.update({
        where: { id },
        data: { status: TableSessionStatus.CLOSED, closedAt: new Date() },
      });

      await tx.restaurantTable.update({
        where: { id: session.tableId },
        data: { status: TableStatus.AVAILABLE },
      });

      await tx.serviceRequest.updateMany({
        where: { tableSessionId: id, status: ServiceRequestStatus.PENDING },
        data: { status: ServiceRequestStatus.RESOLVED, resolvedAt: new Date() },
      });
    });

    // ลูกค้าโต๊ะนั้นควรเห็นว่าโต๊ะปิดแล้ว (หน้า QR จะขึ้นขอบคุณ/หมดอายุ)
    this.events.emitToStaffAndSession(id, 'table-session.closed', {
      id,
      status: TableSessionStatus.CLOSED,
      tableId: session.tableId,
    });
    return this.findOne(id);
  }

  /** ใช้ร่วมกันโดย public/service-requests เพื่อ resolve + validate QR session จาก token */
  async resolveOpenSessionByToken(token: string) {
    if (!token) {
      throw new BadRequestException('ต้องส่ง sessionToken');
    }

    const session = await this.prisma.tableSession.findUnique({
      where: { token },
      include: { table: true },
    });
    if (!session) {
      throw new NotFoundException('ไม่พบ QR session นี้');
    }
    if (session.status !== TableSessionStatus.OPEN) {
      throw new BadRequestException('QR session นี้ปิดแล้ว');
    }
    if (session.expiresAt && session.expiresAt < new Date()) {
      // ยังมียอดค้างจ่าย = ลูกค้ายังนั่งอยู่ ห้ามหมดอายุ ไม่งั้นบิลหายจากหน้าเก็บเงิน
      // (หน้า Check โชว์เฉพาะ session ที่เปิดอยู่) และโต๊ะถูกปล่อยว่างทั้งที่ยังไม่จ่าย
      // ต่ออายุให้อีกรอบแทน — session จะปิดเองตอนเก็บเงินครบ
      const unpaidCount = await countUnpaidOrders(this.prisma, session.id);
      if (unpaidCount > 0) {
        return this.prisma.tableSession.update({
          where: { id: session.id },
          data: { expiresAt: new Date(Date.now() + DEFAULT_SESSION_TTL_MS) },
          include: { table: true },
        });
      }

      // คืนโต๊ะให้ว่างด้วย ไม่งั้นโต๊ะจะค้างเป็น OCCUPIED ตลอดไป เปิด QR ใหม่ไม่ได้
      await this.prisma.$transaction([
        this.prisma.tableSession.update({
          where: { id: session.id },
          data: { status: TableSessionStatus.EXPIRED },
        }),
        this.prisma.restaurantTable.update({
          where: { id: session.tableId },
          data: { status: TableStatus.AVAILABLE },
        }),
      ]);
      this.events.emitToStaffAndSession(session.id, 'table-session.closed', {
        id: session.id,
        status: TableSessionStatus.EXPIRED,
        tableId: session.tableId,
      });
      throw new BadRequestException('QR session นี้หมดอายุแล้ว');
    }
    return session;
  }

  private generateToken() {
    return randomBytes(24).toString('hex');
  }

  private toSessionSummary(
    session: Prisma.TableSessionGetPayload<{
      include: {
        table: true;
        orders: { include: { items: { include: { selectedOptions: true } } } };
        serviceRequests: true;
      };
    }>,
  ) {
    const { serviceRequests, ...rest } = session;
    const checkoutRequest =
      serviceRequests
        .filter(
          (request) =>
            request.type === ServiceRequestType.CHECKOUT &&
            request.status === ServiceRequestStatus.PENDING,
        )
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0] ??
      null;

    return {
      ...rest,
      total: this.calculateSessionTotal(session.orders),
      billingStatus: checkoutRequest ? 'AWAITING_CHECKOUT' : 'IN_PROGRESS',
      checkoutRequest: checkoutRequest
        ? {
            id: checkoutRequest.id,
            paymentMethod: checkoutRequest.paymentMethod,
            createdAt: checkoutRequest.createdAt,
          }
        : null,
    };
  }

  private calculateSessionTotal(
    orders: Prisma.OrderGetPayload<{
      include: { items: { include: { selectedOptions: true } } };
    }>[],
  ) {
    // ยอดค้างจ่ายจริง: ตัดออเดอร์ที่ยกเลิก และที่จ่ายไปแล้ว (แยกบิลจ่ายบางส่วน)
    return orders
      .filter(
        (order) =>
          order.status !== OrderStatus.CANCELLED && order.paymentId === null,
      )
      .reduce(
        (orderSum, order) =>
          orderSum.plus(
            order.items.reduce((itemSum, item) => {
              const optionTotal = item.selectedOptions.reduce(
                (optionSum, option) => optionSum.plus(option.price),
                new Prisma.Decimal(0),
              );
              return itemSum.plus(item.unitPrice.plus(optionTotal).mul(item.quantity));
            }, new Prisma.Decimal(0)),
          ),
        new Prisma.Decimal(0),
      );
  }
}
