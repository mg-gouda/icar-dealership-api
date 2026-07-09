import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';
import { PostingService } from '../finance/posting/posting.service';
import { AuditService } from '../audit/audit.service';

@Injectable()
export class CommissionsService {
  constructor(
    private prisma: PrismaService,
    private posting: PostingService,
    private audit: AuditService,
  ) {}

  async list(filters: {
    status?: string;
    userId?: string;
    dealId?: string;
    page: number;
    limit: number;
  }) {
    const where: any = {};
    if (filters.status) where.status = filters.status;
    if (filters.userId) where.userId = filters.userId;
    if (filters.dealId) where.dealId = filters.dealId;

    const [items, total] = await Promise.all([
      this.prisma.dealCommission.findMany({
        where,
        skip: (filters.page - 1) * filters.limit,
        take: filters.limit,
        orderBy: { createdAt: 'desc' },
        include: {
          user: { select: { id: true, name: true, email: true } },
          deal: {
            select: {
              id: true,
              status: true,
              salePrice: true,
              vehicle: { select: { make: true, model: true, year: true } },
              location: { select: { name: true } },
            },
          },
          commissionPlan: { select: { name: true } },
        },
      }),
      this.prisma.dealCommission.count({ where }),
    ]);
    return { items, total, page: filters.page, limit: filters.limit };
  }

  async summary(userId?: string) {
    const where: any = userId ? { userId } : {};
    const rows = await this.prisma.dealCommission.groupBy({
      by: ['status'],
      where,
      _sum: { calculatedAmount: true },
      _count: { id: true },
    });
    return rows.map((r) => ({
      status: r.status,
      count: r._count.id,
      total: Number(r._sum.calculatedAmount ?? 0),
    }));
  }

  async report(opts: { dateFrom?: string; dateTo?: string; userId?: string }) {
    const where: any = {};
    if (opts.userId) where.userId = opts.userId;
    if (opts.dateFrom || opts.dateTo) {
      where.accruedAt = {};
      if (opts.dateFrom) where.accruedAt.gte = new Date(opts.dateFrom);
      if (opts.dateTo)
        where.accruedAt.lte = new Date(opts.dateTo + 'T23:59:59Z');
    }
    const rows = await this.prisma.dealCommission.groupBy({
      by: ['userId', 'status'],
      where,
      _sum: { calculatedAmount: true },
      _count: { id: true },
    });

    // Fetch user names for the grouped userIds
    const userIds = [...new Set(rows.map((r) => r.userId))];
    const users = await this.prisma.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true, name: true, role: true },
    });
    const userMap = Object.fromEntries(users.map((u) => [u.id, u]));

    // Pivot to per-user summary
    const byUser: Record<string, any> = {};
    for (const r of rows) {
      if (!byUser[r.userId])
        byUser[r.userId] = {
          user: userMap[r.userId] ?? { id: r.userId, name: r.userId },
          ACCRUED: 0,
          PAYABLE: 0,
          PAID: 0,
          CANCELLED: 0,
          total: 0,
          count: 0,
        };
      byUser[r.userId][r.status] = Number(r._sum.calculatedAmount ?? 0);
      byUser[r.userId].total += Number(r._sum.calculatedAmount ?? 0);
      byUser[r.userId].count += r._count.id;
    }

    return Object.values(byUser).sort((a: any, b: any) => b.total - a.total);
  }

  async findOne(id: string) {
    return this.prisma.dealCommission.findUniqueOrThrow({
      where: { id },
      include: {
        user: { select: { id: true, name: true, email: true, role: true } },
        deal: {
          include: {
            vehicle: {
              select: { make: true, model: true, year: true, vin: true },
            },
            location: { select: { name: true } },
            customer: { select: { name: true } },
          },
        },
        commissionPlan: true,
        accrualJournalEntry: { select: { id: true, ref: true, status: true } },
        payoutJournalEntry: { select: { id: true, ref: true, status: true } },
      },
    });
  }

  async markPayable(id: string) {
    const c = await this.prisma.dealCommission.findUniqueOrThrow({
      where: { id },
    });
    if (c.status !== 'ACCRUED')
      throw new BadRequestException(
        'Only ACCRUED commissions can be marked payable',
      );
    return this.prisma.dealCommission.update({
      where: { id },
      data: { status: 'PAYABLE', payableAt: new Date() },
    });
  }

  async batchPay(commissionIds: string[], journalId: string, userId: string) {
    if (!commissionIds?.length)
      throw new BadRequestException('No commission IDs provided');

    const commissions = await this.prisma.dealCommission.findMany({
      where: { id: { in: commissionIds }, status: 'PAYABLE' },
    });

    if (commissions.length === 0)
      throw new BadRequestException(
        'No PAYABLE commissions found in selection',
      );

    await this.posting.payCommission(commissionIds, journalId, userId);

    await this.audit.log({
      entity: 'Commission',
      entityId: commissionIds.join(','),
      action: 'COMMISSION_PAID',
      userId,
    });

    const updated = await this.prisma.dealCommission.findMany({
      where: { id: { in: commissionIds } },
      select: { id: true, status: true, calculatedAmount: true, paidAt: true },
    });
    return { paid: updated.length, commissions: updated };
  }
}
