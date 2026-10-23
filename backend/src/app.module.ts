import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { createIdentityTracker, ipTracker } from './common/throttle-trackers';
import { PrismaModule } from './prisma/prisma.module';
import { MenuModule } from './menu/menu.module';
import { OrdersModule } from './orders/orders.module';
import { CategoriesModule } from './categories/categories.module';
import { TablesModule } from './tables/tables.module';
import { PaymentsModule } from './payments/payments.module';
import { AuthModule } from './auth/auth.module';
import { TableSessionsModule } from './table-sessions/table-sessions.module';
import { PublicModule } from './public/public.module';
import { ServiceRequestsModule } from './service-requests/service-requests.module';
import { UsersModule } from './users/users.module';
import { ExpensesModule } from './expenses/expenses.module';
import { ReportsModule } from './reports/reports.module';
import { CashClosesModule } from './cash-closes/cash-closes.module';
import { IngredientsModule } from './ingredients/ingredients.module';
import { EventsModule } from './events/events.module';
import { HealthModule } from './health/health.module';
import { UploadsModule } from './uploads/uploads.module';

@Module({
  imports: [
    HealthModule,
    UploadsModule,
    ConfigModule.forRoot({ isGlobal: true }),
    // Rate limit 2 ชั้น (ดูเหตุผลใน common/throttle-trackers.ts)
    //   default = ต่อคน (พนักงาน/QR โต๊ะ) THROTTLE_LIMIT ครั้ง/นาที — /auth/login เข้มกว่านี้ (ดู auth.controller)
    //   ip      = เพดานรวมต่อ IP THROTTLE_IP_LIMIT ครั้ง/นาที — ทั้งร้านใช้ IP เดียวกันได้ แต่ bot ยิงถล่มไม่ได้
    ThrottlerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const jwt = new JwtService({ secret: config.getOrThrow<string>('JWT_SECRET') });
        return [
          {
            name: 'default',
            ttl: 60_000,
            limit: Number(config.get('THROTTLE_LIMIT') ?? 600),
            getTracker: createIdentityTracker(jwt),
          },
          {
            name: 'ip',
            ttl: 60_000,
            limit: Number(config.get('THROTTLE_IP_LIMIT') ?? 1000),
            getTracker: ipTracker,
          },
        ];
      },
    }),
    PrismaModule,
    EventsModule,
    CategoriesModule,
    MenuModule,
    IngredientsModule,
    TablesModule,
    OrdersModule,
    PaymentsModule,
    TableSessionsModule,
    PublicModule,
    ServiceRequestsModule,
    UsersModule,
    ExpensesModule,
    ReportsModule,
    CashClosesModule,
    AuthModule,
  ],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
