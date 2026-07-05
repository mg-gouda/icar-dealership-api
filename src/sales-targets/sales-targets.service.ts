import { Injectable } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';

@Injectable()
export class SalesTargetsService {
  constructor(private prisma: PrismaService) {}

  async findAll(query: {
    locationId?: string;
    period?: string;
    companyId: string;
    page?: number;
    limit?: number;
  }) {
    const { locationId, period, companyId, page = 1, limit = 50 } = query;
    const where: any = { companyId };
    if (locationId) where.locationId = locationId;
    if (period) where.period = period;

    const [data, total] = await this.prisma.$transaction([
      this.prisma.salesTarget.findMany({
        where,
        include: {
          user: { select: { id: true, name: true, email: true } },
          location: { select: { id: true, name: true } },
        },
        orderBy: { period: 'desc' },
        skip: (Number(page) - 1) * Number(limit),
        take: Number(limit),
      }),
      this.prisma.salesTarget.count({ where }),
    ]);
    return { data, total, page: Number(page), limit: Number(limit) };
  }

  async upsert(data: {
    userId: string;
    locationId: string;
    period: string;
    targetUnits?: number;
    targetRevenue?: number;
    companyId: string;
  }) {
    return this.prisma.salesTarget.upsert({
      where: {
        userId_locationId_period: {
          userId: data.userId,
          locationId: data.locationId,
          period: data.period,
        },
      },
      create: {
        userId: data.userId,
        locationId: data.locationId,
        period: data.period,
        targetUnits: data.targetUnits ?? 0,
        targetRevenue: data.targetRevenue ?? 0,
        companyId: data.companyId,
      },
      update: {
        targetUnits: data.targetUnits,
        targetRevenue: data.targetRevenue,
      },
    });
  }

  async update(id: string, data: { targetUnits?: number; targetRevenue?: number }) {
    return this.prisma.salesTarget.update({
      where: { id },
      data: {
        ...(data.targetUnits !== undefined && { targetUnits: data.targetUnits }),
        ...(data.targetRevenue !== undefined && { targetRevenue: data.targetRevenue }),
      },
    });
  }

  async getAttainment(query: {
    locationId?: string;
    period?: string;
    companyId: string;
  }) {
    // Default period = current month YYYY-MM
    const period = query.period ?? new Date().toISOString().slice(0, 7);
    const where: any = { companyId: query.companyId, period };
    if (query.locationId) where.locationId = query.locationId;

    const targets = await this.prisma.salesTarget.findMany({
      where,
      include: {
        user: { select: { id: true, name: true } },
        location: { select: { id: true, name: true } },
      },
    });

    // Compute period date range for deal filtering
    const [year, month] = period.split('-').map(Number);
    const periodStart = new Date(year, month - 1, 1);
    const periodEnd = new Date(year, month, 1); // exclusive upper bound

    const results = await Promise.all(
      targets.map(async (t) => {
        const dealWhere: any = {
          salesRepId: t.userId,
          locationId: t.locationId,
          status: 'FINALIZED',
          createdAt: { gte: periodStart, lt: periodEnd },
        };

        const [actualUnits, revenueAgg] = await this.prisma.$transaction([
          this.prisma.deal.count({ where: dealWhere }),
          this.prisma.deal.aggregate({ where: dealWhere, _sum: { salePrice: true } }),
        ]);

        const actualRevenue = Number(revenueAgg._sum.salePrice ?? 0);
        const targetUnits = t.targetUnits || 0;
        const targetRevenue = Number(t.targetRevenue) || 0;

        return {
          userId: t.userId,
          userName: t.user.name,
          locationId: t.locationId,
          locationName: t.location.name,
          targetUnits,
          targetRevenue,
          actualUnits,
          actualRevenue,
          unitsAttainmentPct: targetUnits > 0 ? Math.round((actualUnits / targetUnits) * 10000) / 100 : 0,
          revenueAttainmentPct: targetRevenue > 0 ? Math.round((actualRevenue / targetRevenue) * 10000) / 100 : 0,
        };
      }),
    );

    return { period, targets: results };
  }
}
