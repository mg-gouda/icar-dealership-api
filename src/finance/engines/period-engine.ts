/**
 * Period Engine
 *
 * Fiscal period auto-generation and date-to-period lock checks.
 * Ported from iTourTMS — TRPCError replaced with NestJS exceptions.
 */

import { BadRequestException } from '@nestjs/common';

// ── Types ──

export interface GeneratedPeriod {
  name: string;
  code: string;
  number: number;
  startDate: Date;
  endDate: Date;
}

// ── Core Functions ──

/**
 * Generate monthly periods for a fiscal year.
 * Iterates month by month from dateFrom to dateTo, creating one period
 * per calendar month. Optionally adds a 13th adjustment period.
 */
export function generatePeriods(
  dateFrom: Date,
  dateTo: Date,
  includePeriod13: boolean,
): GeneratedPeriod[] {
  const periods: GeneratedPeriod[] = [];
  const current = new Date(dateFrom);
  let number = 1;

  while (current <= dateTo && number <= 12) {
    const year = current.getFullYear();
    const month = current.getMonth();

    const periodStart = new Date(year, month, 1);
    const periodEnd = new Date(year, month + 1, 0);

    const clampedStart = periodStart < dateFrom ? dateFrom : periodStart;
    const clampedEnd = periodEnd > dateTo ? dateTo : periodEnd;

    const monthName = clampedStart.toLocaleString('en', {
      month: 'long',
      year: 'numeric',
    });
    const monthCode = `${year}-${String(month + 1).padStart(2, '0')}`;

    periods.push({
      name: monthName,
      code: monthCode,
      number,
      startDate: clampedStart,
      endDate: clampedEnd,
    });

    number++;
    current.setMonth(current.getMonth() + 1);
    current.setDate(1);
  }

  if (includePeriod13 && periods.length > 0) {
    const lastPeriod = periods[periods.length - 1];
    periods.push({
      name: `Adjustments ${lastPeriod.endDate.getFullYear()}`,
      code: `${lastPeriod.endDate.getFullYear()}-13`,
      number: 13,
      startDate: lastPeriod.endDate,
      endDate: lastPeriod.endDate,
    });
  }

  return periods;
}
