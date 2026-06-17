import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuditService } from '../../audit/audit.service';

@Injectable()
export class TaxesService {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
  ) {}

  // ── Taxes ──

  async listTaxes(query: { scope?: string }) {
    const where: any = {};
    if (query.scope) where.scope = query.scope;

    return this.prisma.tax.findMany({
      where,
      include: {
        taxGroup: true,
        account: { select: { id: true, code: true, name: true } },
      },
      orderBy: { name: 'asc' },
    });
  }

  async getTaxById(id: string) {
    const tax = await this.prisma.tax.findUnique({
      where: { id },
      include: {
        taxGroup: true,
        account: { select: { id: true, code: true, name: true } },
      },
    });
    if (!tax) throw new NotFoundException('Tax not found');
    return tax;
  }

  async createTax(data: {
    name: string;
    amount: number;
    computation?: string;
    scope?: string;
    includedInPrice?: boolean;
    taxGroupId?: string;
    accountId: string;
  }, userId: string) {
    const tax = await this.prisma.tax.create({ data: data as any });
    await this.audit.log({
      userId, action: 'CREATE', entity: 'Tax', entityId: tax.id,
    });
    return tax;
  }

  async updateTax(id: string, data: {
    name?: string;
    amount?: number;
    computation?: string;
    scope?: string;
    includedInPrice?: boolean;
    taxGroupId?: string | null;
    accountId?: string;
  }, userId: string) {
    const tax = await this.prisma.tax.findUnique({ where: { id } });
    if (!tax) throw new NotFoundException('Tax not found');

    const updated = await this.prisma.tax.update({ where: { id }, data: data as any });
    await this.audit.log({
      userId, action: 'UPDATE', entity: 'Tax', entityId: id,
      changes: { before: tax, after: updated },
    });
    return updated;
  }

  async deleteTax(id: string, userId: string) {
    const tax = await this.prisma.tax.findUnique({ where: { id } });
    if (!tax) throw new NotFoundException('Tax not found');

    await this.prisma.tax.delete({ where: { id } });
    await this.audit.log({
      userId, action: 'DELETE', entity: 'Tax', entityId: id,
    });
    return { deleted: true };
  }

  // ── Tax Groups ──

  async listGroups() {
    return this.prisma.taxGroup.findMany({
      include: { _count: { select: { taxes: true } } },
      orderBy: { name: 'asc' },
    });
  }

  async createGroup(data: { name: string }, userId: string) {
    const group = await this.prisma.taxGroup.create({ data });
    await this.audit.log({
      userId, action: 'CREATE', entity: 'TaxGroup', entityId: group.id,
    });
    return group;
  }

  async updateGroup(id: string, data: { name?: string }, userId: string) {
    const group = await this.prisma.taxGroup.findUnique({ where: { id } });
    if (!group) throw new NotFoundException('Tax group not found');

    const updated = await this.prisma.taxGroup.update({ where: { id }, data });
    await this.audit.log({
      userId, action: 'UPDATE', entity: 'TaxGroup', entityId: id,
    });
    return updated;
  }

  async deleteGroup(id: string, userId: string) {
    const group = await this.prisma.taxGroup.findUnique({ where: { id } });
    if (!group) throw new NotFoundException('Tax group not found');

    await this.prisma.taxGroup.delete({ where: { id } });
    await this.audit.log({
      userId, action: 'DELETE', entity: 'TaxGroup', entityId: id,
    });
    return { deleted: true };
  }
}
