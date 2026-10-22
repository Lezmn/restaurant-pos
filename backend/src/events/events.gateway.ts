import { Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import {
  OnGatewayConnection,
  OnGatewayDisconnect,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { TableSessionStatus } from '@prisma/client';
import { Server, Socket } from 'socket.io';
import { decimalToNumber } from '../common/interceptors/decimal.interceptor';
import { PrismaService } from '../prisma/prisma.service';

/** ห้องรวมของพนักงานทุกคน (POS / ครัว / เจ้าของ) */
const STAFF_ROOM = 'staff';
/** ห้องของลูกค้าแต่ละโต๊ะ — ผูกกับ QR session ไม่ใช่โต๊ะ กันลูกค้ารอบก่อนเห็นของรอบใหม่ */
const sessionRoom = (sessionId: string) => `session:${sessionId}`;

/**
 * ชื่อ event ที่ server push ให้ client — frontend ฟังแล้ว refetch query ที่เกี่ยวข้อง
 * payload ส่งแค่ id/สถานะพอ ไม่ส่งทั้ง entity เพราะ client จะดึงข้อมูลเต็มผ่าน REST อยู่แล้ว
 */
export type ServerEvent =
  | 'order.created'
  | 'order.updated'
  | 'service-request.created'
  | 'service-request.updated'
  | 'payment.created'
  | 'payment.voided'
  | 'table-session.created'
  | 'table-session.closed'
  /** เมนู/วัตถุดิบเปลี่ยน — ทุกจอต้องดึงเมนูใหม่ (เช่น ปิดวัตถุดิบเพราะของหมด) */
  | 'menu.updated'
  /** ผลตรวจสลิป PromptPay เปลี่ยน (ตรวจซ้ำผ่าน/ไม่ผ่าน, ADMIN ยืนยันเอง) */
  | 'payment.slip-updated';

type StaffPayload = { sub: string; tv?: number };

/** ห้องของแต่ละบัญชี — ไว้ตัดทุก socket ของบัญชีนั้นตอนถูกปิดใช้งาน/ออกจากระบบทุกเครื่อง */
const userRoom = (userId: string) => `user:${userId}`;

/**
 * Handshake: client ส่งอย่างใดอย่างหนึ่งมาใน `socket.handshake.auth`
 *   - `token`        = JWT ของพนักงาน → เข้าห้อง staff
 *   - `sessionToken` = token จาก QR ของลูกค้า → เข้าห้อง session ของตัวเอง
 * ไม่มีทั้งคู่ หรือตรวจไม่ผ่าน → ตัดการเชื่อมต่อทันที
 *
 * CORS ตั้งใน SocketIoAdapter (main.ts) เพราะ decorator นี้รันก่อน .env ถูกโหลด
 */
@WebSocketGateway()
export class EventsGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  private readonly server!: Server;

  private readonly logger = new Logger(EventsGateway.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
  ) {}

  async handleConnection(client: Socket) {
    const auth = (client.handshake.auth ?? {}) as {
      token?: unknown;
      sessionToken?: unknown;
    };

    try {
      if (typeof auth.token === 'string' && auth.token) {
        await this.joinAsStaff(client, auth.token);
        return;
      }
      if (typeof auth.sessionToken === 'string' && auth.sessionToken) {
        await this.joinAsCustomer(client, auth.sessionToken);
        return;
      }
      throw new Error('ต้องส่ง token หรือ sessionToken ใน handshake.auth');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'unauthorized';
      this.logger.warn(`ปฏิเสธการเชื่อมต่อ ${client.id}: ${message}`);
      client.emit('error', { message });
      client.disconnect(true);
    }
  }

  handleDisconnect(client: Socket) {
    this.logger.debug(`ตัดการเชื่อมต่อ ${client.id}`);
  }

  /** ตัดทุก socket ของบัญชีนี้ — เครื่องที่ถูกเตะจะไม่ได้รับ event ต่อ (REST ก็ได้ 401 แล้วเด้งไป login) */
  disconnectUser(userId: string) {
    this.server?.in(userRoom(userId)).disconnectSockets(true);
  }

  /** ส่งให้พนักงานทุกคน */
  emitToStaff(event: ServerEvent, payload: unknown) {
    this.server?.to(STAFF_ROOM).emit(event, decimalToNumber(payload));
  }

  /** ส่งให้ทุกคนที่ต่ออยู่ ทั้งพนักงานและลูกค้าทุกโต๊ะ — ใช้กับเรื่องที่กระทบทั้งร้าน เช่น เมนูเปลี่ยน */
  emitToEveryone(event: ServerEvent, payload: unknown) {
    this.server?.emit(event, decimalToNumber(payload));
  }

  /** ส่งให้ลูกค้าที่นั่งอยู่ใน QR session นั้น (ถ้าไม่มี session ก็ไม่ต้องส่ง) */
  emitToSession(
    sessionId: string | null | undefined,
    event: ServerEvent,
    payload: unknown,
  ) {
    if (!sessionId) return;
    this.server?.to(sessionRoom(sessionId)).emit(event, decimalToNumber(payload));
  }

  /** ส่งให้ทั้งพนักงานและลูกค้าโต๊ะนั้น — เคสส่วนใหญ่ใช้อันนี้ */
  emitToStaffAndSession(
    sessionId: string | null | undefined,
    event: ServerEvent,
    payload: unknown,
  ) {
    this.emitToStaff(event, payload);
    this.emitToSession(sessionId, event, payload);
  }

  private async joinAsStaff(client: Socket, token: string) {
    // role ไม่สำคัญเพราะทุก role เห็น event เดียวกัน แต่ต้องเช็คบัญชียังใช้ได้ (query ครั้งเดียวตอนต่อ)
    const payload = await this.jwtService.verifyAsync<StaffPayload>(token);
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: { isActive: true, tokenVersion: true },
    });
    if (!user?.isActive || (payload.tv ?? 0) !== user.tokenVersion) {
      throw new Error('บัญชีนี้ถูกปิดใช้งานหรือถูกออกจากระบบแล้ว');
    }
    await client.join([STAFF_ROOM, userRoom(payload.sub)]);
    client.data.userId = payload.sub;
    this.logger.debug(`พนักงาน ${payload.sub} เชื่อมต่อ (${client.id})`);
  }

  private async joinAsCustomer(client: Socket, sessionToken: string) {
    const session = await this.prisma.tableSession.findUnique({
      where: { token: sessionToken },
      select: { id: true, status: true, expiresAt: true },
    });
    if (!session) throw new Error('ไม่พบ QR session นี้');
    if (session.status !== TableSessionStatus.OPEN) {
      throw new Error('QR session นี้ปิดแล้ว');
    }
    if (session.expiresAt && session.expiresAt < new Date()) {
      throw new Error('QR session นี้หมดอายุแล้ว');
    }
    await client.join(sessionRoom(session.id));
    client.data.sessionId = session.id;
    this.logger.debug(`ลูกค้า session ${session.id} เชื่อมต่อ (${client.id})`);
  }
}
