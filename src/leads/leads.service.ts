import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';

@Injectable()
export class LeadsService {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
  ) {}

  async findAll(query: {
    locationId?: string;
    assignedToUserId?: string;
    status?: string;
    source?: string;
    page?: number;
    limit?: number;
  }) {
    const {
      locationId,
      assignedToUserId,
      status,
      source,
      page = 1,
      limit = 20,
    } = query;
    const where = {
      ...(locationId && { locationId }),
      ...(assignedToUserId && { assignedToUserId }),
      ...(status && { status: status as any }),
      ...(source && { source: source as any }),
    };
    const [data, total] = await this.prisma.$transaction([
      this.prisma.lead.findMany({
        where,
        include: {
          assignedTo: { select: { id: true, name: true } },
          vehicle: { select: { id: true, make: true, model: true, year: true } },
          location: { select: { id: true, name: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (Number(page) - 1) * Number(limit),
        take: Number(limit),
      }),
      this.prisma.lead.count({ where }),
    ]);
    return { data, total, page: Number(page), limit: Number(limit) };
  }

  async findById(id: string) {
    const lead = await this.prisma.lead.findUnique({
      where: { id },
      include: {
        assignedTo: { select: { id: true, name: true, email: true } },
        vehicle: true,
        location: true,
        activities: { orderBy: { createdAt: 'desc' }, take: 50 },
      },
    });
    if (!lead) throw new NotFoundException(`Lead ${id} not found`);
    return lead;
  }

  async create(
    data: {
      locationId: string;
      name: string;
      phone?: string;
      email?: string;
      source?: string;
      vehicleId?: string;
      assignedToUserId?: string;
      notes?: string;
    },
    userId: string,
  ) {
    // Auto-assign via least-loaded SALES_REP when no assignee provided
    let assignedToUserId = data.assignedToUserId ?? undefined;
    if (!assignedToUserId) {
      assignedToUserId =
        (await this.leastLoadedSalesRep(data.locationId)) ?? undefined;
    }

    const lead = await this.prisma.lead.create({
      data: {
        locationId: data.locationId,
        name: data.name,
        phone: data.phone,
        email: data.email,
        source: (data.source as any) ?? 'WEBSITE',
        vehicleId: data.vehicleId,
        assignedToUserId,
        notes: data.notes,
        status: 'NEW',
      },
    });
    await this.audit.log({
      entity: 'Lead',
      entityId: lead.id,
      action: 'CREATE',
      userId,
      newValue: lead,
    });
    return lead;
  }

  /** Returns the id of the SALES_REP at locationId with fewest open leads, or null if none. */
  private async leastLoadedSalesRep(
    locationId: string,
  ): Promise<string | null> {
    const reps = await this.prisma.user.findMany({
      where: { role: 'SALES_REP', locationId, isActive: true },
      select: { id: true },
    });
    if (reps.length === 0) return null;

    const openCounts = await Promise.all(
      reps.map(async (r) => {
        const count = await this.prisma.lead.count({
          where: {
            assignedToUserId: r.id,
            status: { in: ['NEW', 'CONTACTED', 'QUALIFIED'] },
          },
        });
        return { id: r.id, count };
      }),
    );

    openCounts.sort((a, b) => a.count - b.count);
    return openCounts[0].id;
  }

  async update(
    id: string,
    data: Partial<{
      status: string;
      assignedToUserId: string;
      vehicleId: string;
      notes: string;
    }>,
    userId: string,
  ) {
    const lead = await this.prisma.lead.update({
      where: { id },
      data: data as any,
    });
    await this.audit.log({
      entity: 'Lead',
      entityId: id,
      action: 'UPDATE',
      userId,
      newValue: data,
    });
    return lead;
  }

  async addActivity(
    leadId: string,
    data: {
      type: string;
      note?: string;
      notes?: string;
      outcome?: string;
    },
    userId: string,
  ) {
    const activity = await this.prisma.leadActivity.create({
      data: { leadId, userId, type: data.type, note: data.note ?? data.notes },
    });
    return activity;
  }

  async convertToDeal(leadId: string, userId: string) {
    const lead = await this.prisma.lead.findUniqueOrThrow({
      where: { id: leadId },
      include: { location: true },
    });

    // Mark lead won
    await this.prisma.lead.update({
      where: { id: leadId },
      data: { status: 'CLOSED_WON' },
    });

    // Create a draft deal if customer + vehicle are known; otherwise return lead
    if (!lead.customerId || !lead.vehicleId) {
      await this.audit.log({
        entity: 'Lead',
        entityId: leadId,
        action: 'CONVERT',
        userId,
        newValue: { status: 'CLOSED_WON' },
      });
      return { id: null, leadId };
    }

    const location = lead.location;
    const deal = await this.prisma.deal.create({
      data: {
        locationId: lead.locationId,
        vehicleId: lead.vehicleId,
        customerId: lead.customerId,
        salesRepId: lead.assignedToUserId ?? userId,
        leadId: lead.id,
        purchaseMethod: 'CASH',
        salePrice: 0, // to be set by sales rep
        adminFee: Number(location.defaultAdminFee ?? 0),
        insuranceFee: Number(location.defaultInsuranceFee ?? 0),
        status: 'DRAFT',
      },
    });

    // Mark vehicle RESERVED
    await this.prisma.vehicle.update({
      where: { id: lead.vehicleId },
      data: { status: 'RESERVED' },
    });

    await this.audit.log({
      entity: 'Lead',
      entityId: leadId,
      action: 'CONVERT',
      userId,
      newValue: { dealId: deal.id },
    });
    return deal;
  }
}
