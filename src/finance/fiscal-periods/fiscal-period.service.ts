import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';

/**
 * Canonical fiscal-period gate. Every module that posts GL entries
 * calls assertOpen() before creating POSTED journal entries.
 * Uses FiscalPeriod.isLocked -- NOT FiscalYear.lockDate.
 */
@Injectable()
export class FiscalPeriodService {
  constructor(private prisma: PrismaService) {}

  /**
   * Throws BadRequestException if:
   * - no FiscalPeriod covers `date` for `companyId`
   * - the matching period has isLocked === true
   */
  async assertOpen(date: Date, companyId: string): Promise<void> {
    const period = await this.prisma.fiscalPeriod.findFirst({
      where: {
        companyId,
        startDate: { lte: date },
        endDate: { gte: date },
      },
    });

    if (!period) {
      throw new BadRequestException('No fiscal period found for this date');
    }

    if (period.isLocked) {
      throw new BadRequestException('Fiscal period is locked');
    }
  }
}
