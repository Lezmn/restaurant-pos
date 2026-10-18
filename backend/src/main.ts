import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { DecimalInterceptor } from './common/interceptors/decimal.interceptor';
import { SocketIoAdapter } from './events/socket-io.adapter';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  const isProduction = process.env.NODE_ENV === 'production';

  // อยู่หลัง nginx/reverse proxy → ต้องเชื่อ X-Forwarded-For ไม่งั้น rate limit
  // จะเห็นทุก request มาจาก IP เดียว (ของ proxy) แล้วบล็อกทั้งร้านพร้อมกัน
  if (process.env.TRUST_PROXY === 'true') {
    app.set('trust proxy', 1);
  }

  // security headers มาตรฐาน — ปิด CSP เพราะ Swagger UI โหลด script inline
  // และ API นี้ไม่ได้เสิร์ฟหน้า HTML อื่นให้ CSP ปกป้องอยู่แล้ว
  app.use(helmet({ contentSecurityPolicy: false }));

  // frontend รันคนละ origin (Vite dev server) ต้องเปิด CORS ไม่งั้น browser บล็อก
  // ใส่หลาย origin ได้โดยคั่นด้วย comma ใน CORS_ORIGIN
  const corsOrigins = (process.env.CORS_ORIGIN ?? 'http://localhost:5173')
    .split(',')
    .map((o) => o.trim());
  app.enableCors({ origin: corsOrigins, credentials: true });

  // WebSocket (socket.io) ใช้ origin ชุดเดียวกัน — ดู events/events.gateway.ts
  app.useWebSocketAdapter(new SocketIoAdapter(app, corsOrigins));

  // Prisma ส่ง Decimal เป็น string ตอน serialize — แปลงเป็น number ให้ทุก response
  app.useGlobalInterceptors(new DecimalInterceptor());

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true, // ตัด field ที่ไม่ได้ประกาศใน DTO ทิ้ง
      transform: true, // แปลง type อัตโนมัติ (เช่น query string -> number)
    }),
  );

  // Swagger เปิดเสมอตอน dev; production ปิดไว้ก่อน เปิดชั่วคราวด้วย SWAGGER_ENABLED=true
  // ตอนต้องใช้ (เช่น เพิ่มพนักงานผ่าน /users) แล้วปิดกลับ
  const swaggerEnabled = !isProduction || process.env.SWAGGER_ENABLED === 'true';
  if (swaggerEnabled) {
    const config = new DocumentBuilder()
      .setTitle('Restaurant Management API')
      .setDescription('API สำหรับจัดการร้านอาหาร: เมนู, ออเดอร์, โต๊ะ, พนักงาน')
      .setVersion('1.0')
      .addBearerAuth()
      .build();
    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup('docs', app, document);
  }

  const port = process.env.PORT ?? 3000;
  await app.listen(port);
  console.log(`🚀 Server running on http://localhost:${port}`);
  if (swaggerEnabled) {
    console.log(`📚 Swagger docs at http://localhost:${port}/docs`);
  }
}
bootstrap();
