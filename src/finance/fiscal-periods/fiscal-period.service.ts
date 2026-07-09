import { Injectable, BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuditService } from '../../audit/audit.service';

/**
 * Canonical fiscal-period gate. Every module that posts GL entries
 * calls assertOpen() before creating POSTED journal entries.
 * Uses FiscalPeriod.isLocked -- NOT FiscalYear.lockDate.
 */
@Injectable()
export class FiscalPeriodService {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
  ) {}

  /**
   * Throws BadRequestException if:
   * - no FiscalPeriod covers `date` for `companyId`
   * - the matching period has isLocked === true AND userId lacks finance:lock-override
   *
   * When userId is supplied and the period is locked, checks UserPermission for
   * finance:lock-override. If granted, allows posting and emits LOCK_OVERRIDE_POST audit.
   */
  async assertOpen(
    date: Date,
    companyId: string,
    userId?: string,
    tx?: Prisma.TransactionClient,
  ): Promise<void> {
    const db = tx ?? this.prisma;
    const period = await db.fiscalPeriod.findFirst({
      where: {
        companyId,
        startDate: { lte: date },
        endDate: { gte: date },
      },
    });

    if (!period) {
      throw new BadRequestException('No fiscal period found for this date');
    }

    // Check parent FiscalYear lockDate first (§7: locked year blocks all posting)
    const fy = await db.fiscalYear.findUnique({
      where: { id: period.fiscalYearId },
      select: { lockDate: true },
    });
    if (fy?.lockDate && date <= fy.lockDate) {
      throw new BadRequestException('Fiscal year is locked');
    }

    if (!period.isLocked) return;

    // Period locked — check override permission when caller provides userId
    if (userId) {
      const override = await db.userPermission.findFirst({
        where: { userId, permissionKey: 'finance:lock-override', granted: true },
      });
      if (override) {
        // ponytail: audit override use; proceed without throwing
        await this.audit.log({
          userId,
          action: 'LOCK_OVERRIDE_POST',
          entity: 'FiscalPeriod',
          entityId: period.id,
          changes: { date: date.toISOString(), companyId },
        });
        return;
      }
    }

    throw new BadRequestException(
      'Fiscal period is locked. Finance Admin – Lock Override permission required.',
    );
  }
}
