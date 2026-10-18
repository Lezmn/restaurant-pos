import { INestApplicationContext } from '@nestjs/common';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { ServerOptions } from 'socket.io';

/**
 * ใส่ CORS ให้ socket.io จาก env เดียวกับ REST (CORS_ORIGIN)
 * ทำผ่าน adapter เพราะ @WebSocketGateway({ cors }) ถูก evaluate ตอน import
 * ซึ่งเร็วกว่าที่ ConfigModule จะโหลด .env
 */
export class SocketIoAdapter extends IoAdapter {
  constructor(
    app: INestApplicationContext,
    private readonly origins: string[],
  ) {
    super(app);
  }

  createIOServer(port: number, options?: ServerOptions) {
    return super.createIOServer(port, {
      ...options,
      cors: { origin: this.origins, credentials: true },
    });
  }
}
