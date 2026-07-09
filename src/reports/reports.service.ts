import { Injectable } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';
import { Decimal } from '@prisma/client/runtime/library';
import { buildVehicleWhereClause } from '../common/helpers/vehicle-query.helper';

interface DateRange {
  dateFrom?: string;
  dateTo?: string;
}

interface LocationFilter extends DateRange {
  locationId?: string;
}

@Injectable()
export class OperationalReportsService {
  constructor(private prisma: PrismaService) {}

  // ── Sales Pipeline ────────────────────────────────────────────────

  async salesPipeline(filter: LocationFilter) {
    const where = this.buildDealWhere(filter);

    const [byStatus, byMethod, finalizedDeals] = await Promise.all([
      this.prisma.deal.groupBy({
        by: ['status'],
        _count: { _all: true },
        _sum: { salePrice: true },
        where,
      }),
      this.prisma.deal.groupBy({
        by: ['purchaseMethod'],
        _count: { _all: true },
        where,
      }),
      // For avg days-to-close: FINALIZED deals only
      this.prisma.deal.findMany({
        where: { ...where, status: 'FINALIZED' },
        select: { createdAt: true, updatedAt: true },
      }),
    ]);

    // Build stage map
    const byStage: Record<string, number> = {};
    let totalValue = new Decimal(0);
    for (const row of byStatus) {
      byStage[row.status] = row._count._all;
      if (row._sum.salePrice) {
        totalValue = totalValue.add(row._sum.salePrice);
      }
    }

    const finalized = byStage['FINALIZED'] ?? 0;
    const cancelled = byStage['CANCELLED'] ?? 0;
    const conversionRate =
      finalized + cancelled > 0 ? finalized / (finalized + cancelled) : 0;

    // Avg days to close (updatedAt used as proxy for finalizedAt)
    let avgDaysToClose = 0;
    if (finalizedDeals.length > 0) {
      const totalDays = finalizedDeals.reduce((sum, d) => {
        const ms = d.updatedAt.getTime() - d.createdAt.getTime();
        return sum + ms / 86_400_000;
      }, 0);
      avgDaysToClose = totalDays / finalizedDeals.length;
    }

    const byPurchaseMethod: Record<string, number> = {};
    for (const row of byMethod) {
      byPurchaseMethod[row.purchaseMethod] = row._count._all;
    }

    return {
      byStage,
      conversionRate: +conversionRate.toFixed(2),
      avgDaysToClose: +avgDaysToClose.toFixed(1),
      totalValue,
      byPurchaseMethod,
    };
  }

  // ── Inventory Aging ───────────────────────────────────────────────

  async inventoryAging(locationId?: string) {
    const where = buildVehicleWhereClause({ status: 'AVAILABLE', locationId });

    const vehicles = await this.prisma.vehicle.findMany({
      where,
      select: {
        id: true,
        make: true,
        model: true,
        year: true,
        price: true,
        vin: true,
        createdAt: true,
      },
    });

    const now = Date.now();

    // ponytail: bucket boundaries
    const buckets = {
      '0_30': { count: 0, value: new Decimal(0) },
      '31_60': { count: 0, value: new Decimal(0) },
      '61_90': { count: 0, value: new Decimal(0) },
      over_90: { count: 0, value: new Decimal(0), vehicles: [] as any[] },
    };

    let totalDays = 0;

    for (const v of vehicles) {
      const days = Math.floor((now - v.createdAt.getTime()) / 86_400_000);
      totalDays += days;

      if (days <= 30) {
        buckets['0_30'].count++;
        buckets['0_30'].value = buckets['0_30'].value.add(v.price);
      } else if (days <= 60) {
        buckets['31_60'].count++;
        buckets['31_60'].value = buckets['31_60'].value.add(v.price);
      } else if (days <= 90) {
        buckets['61_90'].count++;
        buckets['61_90'].value = buckets['61_90'].value.add(v.price);
      } else {
        buckets.over_90.count++;
        buckets.over_90.value = buckets.over_90.value.add(v.price);
        buckets.over_90.vehicles.push({
          id: v.id,
          make: v.make,
          model: v.model,
          year: v.year,
          price: v.price,
          vin: v.vin,
          daysInStock: days,
        });
      }
    }

    return {
      total: vehicles.length,
      buckets,
      avgDaysInStock:
        vehicles.length > 0 ? +(totalDays / vehicles.length).toFixed(1) : 0,
    };
  }

  // ── Lead Conversion ───────────────────────────────────────────────

  async leadConversion(filter: LocationFilter) {
    const where = this.buildLeadWhere(filter);

    const [bySource, allLeads, convertedLeads, repStats] = await Promise.all([
      this.prisma.lead.groupBy({
        by: ['source'],
        _count: { _all: true },
        where,
      }),
      this.prisma.lead.count({ where }),
      this.prisma.lead.count({
        where: { ...where, status: 'CLOSED_WON' },
      }),
      // Per-rep breakdown
      this.prisma.lead.groupBy({
        by: ['assignedToUserId'],
        _count: { _all: true },
        where: { ...where, assignedToUserId: { not: null } },
      }),
    ]);

    // Per-rep converted counts
    const repConvertedMap = new Map<string, number>();
    if (repStats.length > 0) {
      const repConvertedRows = await this.prisma.lead.groupBy({
        by: ['assignedToUserId'],
        _count: { _all: true },
        where: { ...where, status: 'CLOSED_WON', assignedToUserId: { not: null } },
      });
      for (const r of repConvertedRows) {
        if (r.assignedToUserId) {
          repConvertedMap.set(r.assignedToUserId, r._count._all);
        }
      }
    }

    // Fetch rep names
    const repIds = repStats
      .map((r) => r.assignedToUserId)
      .filter((id): id is string => id !== null);

    const repUsers =
      repIds.length > 0
        ? await this.prisma.user.findMany({
            where: { id: { in: repIds } },
            select: { id: true, name: true },
          })
        : [];

    const userMap = new Map(repUsers.map((u) => [u.id, u.name]));

    const byRep = repStats
      .filter((r) => r.assignedToUserId !== null)
      .map((r) => ({
        repId: r.assignedToUserId!,
        repName: userMap.get(r.assignedToUserId!) ?? 'Unknown',
        leads: r._count._all,
        converted: repConvertedMap.get(r.assignedToUserId!) ?? 0,
      }));

    // Avg time to convert: CLOSED_WON leads with a Deal
    const wonLeads = await this.prisma.lead.findMany({
      where: { ...where, status: 'CLOSED_WON' },
      select: { createdAt: true, deals: { select: { createdAt: true }, take: 1 } },
    });

    let avgTimeToConvert = 0;
    const leadsWithDeal = wonLeads.filter((l) => l.deals.length > 0);
    if (leadsWithDeal.length > 0) {
      const totalDays = leadsWithDeal.reduce((sum, l) => {
        const dealDate = l.deals[0].createdAt.getTime();
        return sum + (dealDate - l.createdAt.getTime()) / 86_400_000;
      }, 0);
      avgTimeToConvert = totalDays / leadsWithDeal.length;
    }

    const bySourceMap: Record<string, number> = {};
    for (const row of bySource) {
      bySourceMap[row.source] = row._count._all;
    }

    return {
      total: allLeads,
      bySource: bySourceMap,
      converted: convertedLeads,
      conversionRate:
        allLeads > 0 ? +(convertedLeads / allLeads).toFixed(2) : 0,
      avgTimeToConvert: +avgTimeToConvert.toFixed(1),
      byRep,
    };
  }

  // ── Appointment Analytics ─────────────────────────────────────────

  async appointmentAnalytics(filter: LocationFilter) {
    const where = this.buildAppointmentWhere(filter);

    const [byType, byStatus, byLocation, upcoming] = await Promise.all([
      this.prisma.appointment.groupBy({
        by: ['type'],
        _count: { _all: true },
        where,
      }),
      this.prisma.appointment.groupBy({
        by: ['status'],
        _count: { _all: true },
        where,
      }),
      this.prisma.appointment.groupBy({
        by: ['locationId'],
        _count: { _all: true },
        where,
      }),
      this.prisma.appointment.count({
        where: {
          ...where,
          status: 'SCHEDULED',
          scheduledAt: { gte: new Date() },
        },
      }),
    ]);

    // Total
    const total = byStatus.reduce((s, r) => s + r._count._all, 0);

    // Type map
    const byTypeMap: Record<string, number> = {};
    for (const row of byType) {
      byTypeMap[row.type] = row._count._all;
    }

    // Show rate: COMPLETED / (COMPLETED + NO_SHOW)
    const statusMap: Record<string, number> = {};
    for (const row of byStatus) {
      statusMap[row.status] = row._count._all;
    }
    const completed = statusMap['COMPLETED'] ?? 0;
    const noShow = statusMap['NO_SHOW'] ?? 0;
    const showRate =
      completed + noShow > 0 ? completed / (completed + noShow) : 0;

    // Per-location with completed/showed counts
    const locationIds = byLocation.map((r) => r.locationId);
    const locations =
      locationIds.length > 0
        ? await this.prisma.location.findMany({
            where: { id: { in: locationIds } },
            select: { id: true, name: true },
          })
        : [];
    const locNameMap = new Map(locations.map((l) => [l.id, l.name]));

    // Per-location showed counts
    const perLocShowed = await this.prisma.appointment.groupBy({
      by: ['locationId'],
      _count: { _all: true },
      where: { ...where, status: 'COMPLETED' },
    });
    const showedMap = new Map(
      perLocShowed.map((r) => [r.locationId, r._count._all]),
    );

    const byLocationResult = byLocation.map((r) => ({
      locationId: r.locationId,
      name: locNameMap.get(r.locationId) ?? 'Unknown',
      total: r._count._all,
      showed: showedMap.get(r.locationId) ?? 0,
    }));

    return {
      total,
      byType: byTypeMap,
      showRate: +showRate.toFixed(2),
      byLocation: byLocationResult,
      upcoming,
    };
  }

  // ── Private helpers ───────────────────────────────────────────────

  private buildDealWhere(f: LocationFilter) {
    const where: any = {};
    if (f.locationId) where.locationId = f.locationId;
    if (f.dateFrom || f.dateTo) {
      where.createdAt = {};
      if (f.dateFrom) where.createdAt.gte = new Date(f.dateFrom);
      if (f.dateTo) where.createdAt.lte = new Date(f.dateTo);
    }
    return where;
  }

  private buildLeadWhere(f: LocationFilter) {
    const where: any = {};
    if (f.locationId) where.locationId = f.locationId;
    if (f.dateFrom || f.dateTo) {
      where.createdAt = {};
      if (f.dateFrom) where.createdAt.gte = new Date(f.dateFrom);
      if (f.dateTo) where.createdAt.lte = new Date(f.dateTo);
    }
    return where;
  }

  private buildAppointmentWhere(f: LocationFilter) {
    const where: any = {};
    if (f.locationId) where.locationId = f.locationId;
    if (f.dateFrom || f.dateTo) {
      where.scheduledAt = {};
      if (f.dateFrom) where.scheduledAt.gte = new Date(f.dateFrom);
      if (f.dateTo) where.scheduledAt.lte = new Date(f.dateTo);
    }
    return where;
  }
}
