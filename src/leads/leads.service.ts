import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';

@Injectable()
export class LeadsService {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
  ) {}

  findAll(query: {
    locationId?: string; assignedToUserId?: string; status?: string;
    source?: string; page?: number; limit?: number;
  }) {
    const { locationId, assignedToUserId, status, source, page = 1, limit = 20 } = query;
    return this.prisma.lead.findMany({
      where: {
        ...(locationId && { locationId }),
        ...(assignedToUserId && { assignedToUserId }),
        ...(status && { status: status as any }),
        ...(source && { source: source as any }),
      },
      include: {
        assignedTo: { select: { id: true, name: true } },
        vehicle: { select: { id: true, make: true, model: true, year: true } },
        location: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: 'desc' },
      skip: (Number(page) - 1) * Number(limit),
      take: Number(limit),
    });
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

  async create(data: {
    locationId: string; name: string; phone?: string;
    email?: string; source?: string; vehicleId?: string;
    assignedToUserId?: string; notes?: string;
  }, userId: string) {
    const lead = await this.prisma.lead.create({
      data: {
        locationId: data.locationId,
        name: data.name,
        phone: data.phone,
        email: data.email,
        source: (data.source as any) ?? 'WEBSITE',
        vehicleId: data.vehicleId,
        assignedToUserId: data.assignedToUserId,
        notes: data.notes,
        status: 'NEW',
      },
    });
    await this.audit.log({ entity: 'Lead', entityId: lead.id, action: 'CREATE', userId, newValue: lead });
    return lead;
  }

  async update(id: string, data: Partial<{
    status: string; assignedToUserId: string; vehicleId: string; notes: string;
  }>, userId: string) {
    const lead = await this.prisma.lead.update({ where: { id }, data: data as any });
    await this.audit.log({ entity: 'Lead', entityId: id, action: 'UPDATE', userId, newValue: data });
    return lead;
  }

  async addActivity(leadId: string, data: {
    type: string; note?: string;
  }, userId: string) {
    // LeadActivity: leadId, userId, type, note
    const activity = await this.prisma.leadActivity.create({
      data: { leadId, userId, type: data.type, note: data.note },
    });
    return activity;
  }

  async convertToDeal(leadId: string, userId: string) {
    const lead = await this.prisma.lead.update({
      where: { id: leadId },
      data: { status: 'CLOSED_WON' },
    });
    await this.audit.log({ entity: 'Lead', entityId: leadId, action: 'CONVERT', userId, newValue: { status: 'CLOSED_WON' } });
    return lead;
  }
}
