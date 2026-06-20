import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuditService } from '../../audit/audit.service';
import { generatePeriods } from '../engines/period-engine';

@Injectable()
export class FiscalYearsService {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
  ) {}

  async list(companyId: string) {
    return this.prisma.fiscalYear.findMany({
      where: { companyId },
      orderBy: { startDate: 'desc' },
    });
  }

  async getById(id: string, companyId: string) {
    const fy = await this.prisma.fiscalYear.findFirst({
      where: { id, companyId },
    });
    if (!fy) throw new NotFoundException('Fiscal year not found');
    return fy;
  }

  async create(
    data: {
      companyId: string;
      name: string;
      startDate: string;
      endDate: string;
    },
    userId: string,
  ) {
    const startDate = new Date(data.startDate);
    const endDate = new Date(data.endDate);

    // Check overlap
    const overlap = await this.prisma.fiscalYear.findFirst({
      where: {
        companyId: data.companyId,
        startDate: { lte: endDate },
        endDate: { gte: startDate },
      },
    });
    if (overlap) {
      throw new BadRequestException(
        `Date range overlaps with fiscal year: ${overlap.name}`,
      );
    }

    const fy = await this.prisma.fiscalYear.create({
      data: {
        companyId: data.companyId,
        name: data.name,
        startDate,
        endDate,
      },
    });

    await this.audit.log({
      userId,
      action: 'CREATE',
      entity: 'FiscalYear',
      entityId: fy.id,
    });
    return fy;
  }

  /**
   * Generate monthly periods for a fiscal year.
   * Uses the period-engine to compute months, then bulk-inserts.
   * Our schema has no FiscalPeriod model — periods stored as
   * a combination of FiscalYear date ranges. For now, returns the
   * generated period data for the caller to consume; actual storage
   * depends on schema evolution.
   */
  async generatePeriodsForYear(
    id: string,
    companyId: string,
    body: {
      includePeriod13?: boolean;
    },
    userId: string,
  ) {
    const fy = await this.prisma.fiscalYear.findFirst({
      where: { id, companyId },
    });
    if (!fy) throw new NotFoundException('Fiscal year not found');

    const periods = generatePeriods(
      fy.startDate,
      fy.endDate,
      body.includePeriod13 ?? false,
    );

    await this.audit.log({
      userId,
      action: 'GENERATE_PERIODS',
      entity: 'FiscalYear',
      entityId: id,
      changes: { periodCount: periods.length },
    });

    // ponytail: no FiscalPeriod model in schema yet — return computed periods
    return { fiscalYearId: id, periods };
  }

  async update(
    id: string,
    companyId: string,
    data: {
      name?: string;
      lockDate?: string | null;
    },
    userId: string,
  ) {
    const fy = await this.prisma.fiscalYear.findFirst({
      where: { id, companyId },
    });
    if (!fy) throw new NotFoundException('Fiscal year not found');

    const updateData: any = {};
    if (data.name !== undefined) updateData.name = data.name;
    if (data.lockDate !== undefined) {
      updateData.lockDate = data.lockDate ? new Date(data.lockDate) : null;
    }

    const updated = await this.prisma.fiscalYear.update({
      where: { id },
      data: updateData,
    });
    await this.audit.log({
      userId,
      action: 'UPDATE',
      entity: 'FiscalYear',
      entityId: id,
      changes: { before: fy, after: updated },
    });
    return updated;
  }

  async delete(id: string, companyId: string, userId: string) {
    const fy = await this.prisma.fiscalYear.findFirst({
      where: { id, companyId },
    });
    if (!fy) throw new NotFoundException('Fiscal year not found');

    // Check for posted entries in range
    const postedCount = await this.prisma.journalEntry.count({
      where: {
        journal: { companyId },
        status: 'POSTED',
        date: { gte: fy.startDate, lte: fy.endDate },
      },
    });
    if (postedCount > 0) {
      throw new BadRequestException(
        `Cannot delete: ${postedCount} posted journal entries exist in this period`,
      );
    }

    await this.prisma.fiscalYear.delete({ where: { id } });
    await this.audit.log({
      userId,
      action: 'DELETE',
      entity: 'FiscalYear',
      entityId: id,
    });
    return { deleted: true };
  }

  /**
   * Lock a fiscal year by setting its lockDate to its endDate.
   */
  async lock(id: string, companyId: string, userId: string) {
    const fy = await this.prisma.fiscalYear.findFirst({
      where: { id, companyId },
    });
    if (!fy) throw new NotFoundException('Fiscal year not found');

    if (fy.lockDate)
      throw new BadRequestException('Fiscal year already locked');

    const updated = await this.prisma.fiscalYear.update({
      where: { id },
      data: { lockDate: fy.endDate },
    });
    await this.audit.log({
      userId,
      action: 'LOCK',
      entity: 'FiscalYear',
      entityId: id,
    });
    return updated;
  }

  /**
   * Unlock a fiscal year by clearing its lockDate.
   */
  async unlock(id: string, companyId: string, userId: string) {
    const fy = await this.prisma.fiscalYear.findFirst({
      where: { id, companyId },
    });
    if (!fy) throw new NotFoundException('Fiscal year not found');

    if (!fy.lockDate)
      throw new BadRequestException('Fiscal year is not locked');

    const updated = await this.prisma.fiscalYear.update({
      where: { id },
      data: { lockDate: null },
    });
    await this.audit.log({
      userId,
      action: 'UNLOCK',
      entity: 'FiscalYear',
      entityId: id,
    });
    return updated;
  }
}
