import { Injectable, NestInterceptor, ExecutionContext, CallHandler } from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

// ponytail: Prisma Decimal {s,e,d} (BigNumber.js internal) → JS number for clean JSON responses
function isPrismaDecimal(v: unknown): v is { s: number; e: number; d: number[] } {
  if (v === null || typeof v !== 'object') return false;
  const o = v as any;
  return typeof o.s === 'number' && typeof o.e === 'number' && Array.isArray(o.d) &&
    o.d.every((x: unknown) => typeof x === 'number');
}

function decimalToNumber(v: { s: number; e: number; d: number[] }): number {
  // BigNumber.js: d[0] is first coefficient group (unpadded), d[1..] are 7-digit padded groups
  const groups = v.d.map((n, i) => i === 0 ? String(n) : String(n).padStart(7, '0'));
  const coeff = groups.join('');
  // e is the exponent of the leftmost digit (0-indexed from left)
  const num = parseFloat(coeff) * Math.pow(10, v.e - coeff.length + 1);
  return v.s < 0 ? -num : num;
}

function serializeDecimals(v: unknown): unknown {
  if (v === null || v === undefined) return v;
  if (isPrismaDecimal(v)) return decimalToNumber(v);
  if (Array.isArray(v)) return v.map(serializeDecimals);
  if (typeof v === 'object') {
    return Object.fromEntries(
      Object.entries(v as Record<string, unknown>).map(([k, val]) => [k, serializeDecimals(val)])
    );
  }
  return v;
}

@Injectable()
export class DecimalInterceptor implements NestInterceptor {
  intercept(_ctx: ExecutionContext, next: CallHandler): Observable<unknown> {
    return next.handle().pipe(map(serializeDecimals));
  }
}
