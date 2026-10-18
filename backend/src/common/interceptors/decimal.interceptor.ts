import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

/**
 * Prisma คืนค่าคอลัมน์ Decimal มาเป็น object ของ Decimal.js
 * ซึ่งตอน JSON.stringify จะกลายเป็น string ("50") ไม่ใช่ number
 * ทำให้ฝั่ง frontend เอาไปบวกกันแล้วได้ string ต่อกัน ("50" + 10 = "5010")
 *
 * ฟังก์ชันนี้ไล่แปลง Decimal ทุกตัวใน response ให้เป็น number
 * แตะเฉพาะ array กับ plain object — Date/Buffer/stream ปล่อยผ่าน
 */
export function decimalToNumber(value: unknown): unknown {
  if (value === null || value === undefined) return value;

  if (Prisma.Decimal.isDecimal(value)) {
    return (value as Prisma.Decimal).toNumber();
  }

  if (value instanceof Date) return value;

  if (Array.isArray(value)) return value.map(decimalToNumber);

  if (typeof value === 'object') {
    const proto = Object.getPrototypeOf(value) as object | null;
    // ไม่ใช่ plain object (เช่น Buffer, StreamableFile) — ปล่อยไว้อย่างนั้น
    if (proto !== Object.prototype && proto !== null) return value;

    const out: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value)) {
      out[key] = decimalToNumber(item);
    }
    return out;
  }

  return value;
}

@Injectable()
export class DecimalInterceptor implements NestInterceptor {
  intercept(_context: ExecutionContext, next: CallHandler): Observable<unknown> {
    return next.handle().pipe(map(decimalToNumber));
  }
}
