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

  async create(
    data: {
      companyId: string;
      name: string;
      address?: string;
      city?: string;
      phone?: string;
    },
    userId: string,
  ) {
    const loc = await this.prisma.location.create({ data });
    await this.audit.log({
      entity: 'Location',
      entityId: loc.id,
      action: 'CREATE',
      userId,
      newValue: loc,
    });
    return loc;
  }

  async update(
    id: string,
    data: Partial<{
      name: string;
      address: string;
      city: string;
      phone: string;
      defaultAdminFee: number;
      defaultInsuranceFee: number;
      logoUrl: string;
      displayName: string;
      businessHours: unknown;
      timezone: string;
    }>,
    userId: string,
  ) {
    const loc = await this.prisma.location.update({
      where: { id },
      data: data as any,
    });
    await this.audit.log({
      entity: 'Location',
      entityId: id,
      action: 'UPDATE',
      userId,
      newValue: data,
    });
    return loc;
  }

  async deactivate(id: string, userId: string) {
    const loc = await this.prisma.location.findUnique({ where: { id } });
    if (!loc) throw new NotFoundException(`Location ${id} not found`);
    const updated = await this.prisma.location.update({ where: { id }, data: { isActive: false } });
    await this.audit.log({ entity: 'Location', entityId: id, action: 'DELETE', userId, newValue: { isActive: false } });
    return updated;
  }

  async getCompanyProfile(companyId: string) {
    return this.prisma.company.findUniqueOrThrow({
      where: { id: companyId },
      select: {
        id: true,
        name: true,
        taxId: true,
        address: true,
        fiscalYearStartMonth: true,
        adminFeeBoundsPercent: true,
        insuranceFeeBoundsPercent: true,
      },
    });
  }

  async updateCompanyProfile(
    companyId: string,
    data: Partial<{
      name: string;
      taxId: string;
      address: string;
      fiscalYearStartMonth: number;
      adminFeeBoundsPercent: number;
      insuranceFeeBoundsPercent: number;
    }>,
    userId: string,
  ) {
    const clean: typeof data = { ...data };
    if (clean.fiscalYearStartMonth != null)
      clean.fiscalYearStartMonth = Number(clean.fiscalYearStartMonth);
    if (clean.adminFeeBoundsPercent != null)
      clean.adminFeeBoundsPercent = Number(clean.adminFeeBoundsPercent);
    if (clean.insuranceFeeBoundsPercent != null)
      clean.insuranceFeeBoundsPercent = Number(clean.insuranceFeeBoundsPercent);

    const company = await this.prisma.company.update({
      where: { id: companyId },
      data: clean,
    });
    await this.audit.log({
      entity: 'Company',
      entityId: companyId,
      action: 'UPDATE',
      userId,
      newValue: data,
    });
    return company;
  }
}
