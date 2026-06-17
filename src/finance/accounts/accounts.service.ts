import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuditService } from '../../audit/audit.service';

@Injectable()
export class AccountsService {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
  ) {}

  async list(companyId: string, query: {
    search?: string;
    type?: string;
    parentId?: string;
    page?: number;
    limit?: number;
  }) {
    const { search, type, parentId, page = 1, limit = 50 } = query;
    const where: any = { companyId };

    if (search) {
      where.OR = [
        { code: { contains: search, mode: 'insensitive' } },
        { name: { contains: search, mode: 'insensitive' } },
      ];
    }
    if (type) where.type = type;
    if (parentId) where.parentId = parentId;

    const [items, total] = await Promise.all([
      this.prisma.account.findMany({
        where,
        include: { parent: { select: { id: true, code: true, name: true } }, currency: true },
        orderBy: { code: 'asc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.account.count({ where }),
    ]);

    return { items, total, page, limit };
  }

  async getById(id: string, companyId: string) {
    const account = await this.prisma.account.findFirst({
      where: { id, companyId },
      include: {
        parent: { select: { id: true, code: true, name: true } },
        children: { select: { id: true, code: true, name: true, type: true } },
        currency: true,
      },
    });
    if (!account) throw new NotFoundException('Account not found');
    return account;
  }

  async create(data: {
    companyId: string;
    code: string;
    name: string;
    type: string;
    parentId?: string;
    reconcilable?: boolean;
    currencyId?: string;
  }, userId: string) {
    const existing = await this.prisma.account.findFirst({
      where: { companyId: data.companyId, code: data.code },
    });
    if (existing) throw new BadRequestException(`Account code ${data.code} already exists`);

    const account = await this.prisma.account.create({ data: data as any });
    await this.audit.log({
      userId, action: 'CREATE', entity: 'Account', entityId: account.id,
    });
    return account;
  }

  async update(id: string, companyId: string, data: {
    name?: string;
    type?: string;
    parentId?: string | null;
    reconcilable?: boolean;
    currencyId?: string | null;
  }, userId: string) {
    const account = await this.prisma.account.findFirst({ where: { id, companyId } });
    if (!account) throw new NotFoundException('Account not found');

    const updated = await this.prisma.account.update({ where: { id }, data: data as any });
    await this.audit.log({
      userId, action: 'UPDATE', entity: 'Account', entityId: id,
      changes: { before: account, after: updated },
    });
    return updated;
  }

  async delete(id: string, companyId: string, userId: string) {
    const account = await this.prisma.account.findFirst({ where: { id, companyId } });
    if (!account) throw new NotFoundException('Account not found');

    const lineCount = await this.prisma.journalEntryLine.count({
      where: { accountId: id },
    });
    if (lineCount > 0) {
      throw new BadRequestException(
        `Cannot delete account with ${lineCount} journal entry line(s). Archive it instead.`,
      );
    }

    await this.prisma.account.delete({ where: { id } });
    await this.audit.log({
      userId, action: 'DELETE', entity: 'Account', entityId: id,
    });
    return { deleted: true };
  }

  // Tree view — flat list, no pagination
  async listTree(companyId: string) {
    return this.prisma.account.findMany({
      where: { companyId },
      select: {
        id: true, code: true, name: true, type: true,
        parentId: true, reconcilable: true,
      },
      orderBy: { code: 'asc' },
    });
  }
}
