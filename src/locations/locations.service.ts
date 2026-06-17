import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';

@Injectable()
export class LocationsService {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
  ) {}

  findAll(companyId: string) {
    return this.prisma.location.findMany({
      where: { companyId },
      include: { _count: { select: { users: true, vehicles: true } } },
      orderBy: { name: 'asc' },
    });
  }

  async findById(id: string) {
    const loc = await this.prisma.location.findUnique({
      where: { id },
      include: {
        journals: { orderBy: { code: 'asc' } },
        analyticAccount: true,
        _count: { select: { users: true, vehicles: true, deals: true } },
      },
    });
    if (!loc) throw new NotFoundException(`Location ${id} not found`);
    return loc;
  }

  async create(data: {
    companyId: string;
    name: string;
    address?: string;
    city?: string;
    phone?: string;
  }, userId: string) {
    const loc = await this.prisma.location.create({ data });
    await this.audit.log({ entity: 'Location', entityId: loc.id, action: 'CREATE', userId, newValue: loc });
    return loc;
  }

  async update(id: string, data: Partial<{
    name: string; address: string; city: string; phone: string;
    defaultAdminFee: number; defaultInsuranceFee: number;
  }>, userId: string) {
    const loc = await this.prisma.location.update({ where: { id }, data });
    await this.audit.log({ entity: 'Location', entityId: id, action: 'UPDATE', userId, newValue: data });
    return loc;
  }
}
