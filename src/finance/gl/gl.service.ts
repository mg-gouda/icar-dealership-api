import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuditService } from '../../audit/audit.service';

@Injectable()
export class GlService {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
  ) {}

  // -- Accounts (COA) --

  getAccounts(companyId: string, query: { type?: string; search?: string }) {
    const { type, search } = query;
    return this.prisma.account.findMany({
      where: {
        companyId,
        ...(type && { type: type as any }),
        ...(search && {
          OR: [
            { code: { contains: search, mode: 'insensitive' as const } },
            { name: { contains: search, mode: 'insensitive' as const } },
          ],
        }),
      },
      orderBy: { code: 'asc' },
    });
  }

  async getAccount(id: string) {
    const a = await this.prisma.account.findUnique({ where: { id } });
    if (!a) throw new NotFoundException(`Account ${id} not found`);
    return a;
  }

  async createAccount(data: {
    companyId: string; code: string; name: string; type: string;
    parentId?: string;
  }, userId: string) {
    const existing = await this.prisma.account.findFirst({
      where: { companyId: data.companyId, code: data.code },
    });
    if (existing) throw new BadRequestException(`Account code ${data.code} already exists`);
    const account = await this.prisma.account.create({ data: data as any });
    await this.audit.log({ entity: 'Account', entityId: account.id, action: 'CREATE', userId, newValue: account });
    return account;
  }

  // -- Journals --

  getJournals(companyId: string, locationId?: string) {
    return this.prisma.journal.findMany({
      where: { companyId, ...(locationId && { locationId }) },
      orderBy: { code: 'asc' },
    });
  }

  // -- Journal Entries --
  // JournalEntry has no companyId → filter via journal.companyId

  getEntries(companyId: string, query: {
    journalId?: string; locationId?: string; status?: string;
    dateFrom?: string; dateTo?: string; search?: string;
    page?: number; limit?: number;
  }) {
    const { journalId, locationId, status, dateFrom, dateTo, search, page = 1, limit = 20 } = query;
    return this.prisma.journalEntry.findMany({
      where: {
        journal: {
          companyId,
          ...(locationId && { locationId }),
        },
        ...(journalId && { journalId }),
        ...(status && { status: status as any }),
        ...(dateFrom || dateTo ? {
          date: {
            ...(dateFrom && { gte: new Date(dateFrom) }),
            ...(dateTo && { lte: new Date(dateTo) }),
          },
        } : {}),
        ...(search && {
          ref: { contains: search, mode: 'insensitive' as const },
        }),
      },
      include: {
        journal: { select: { id: true, code: true, name: true } },
        lines: {
          include: {
            account: { select: { id: true, code: true, name: true } },
          },
        },
      },
      orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
      skip: (page - 1) * limit,
      take: limit,
    });
  }

  async getEntry(id: string) {
    const entry = await this.prisma.journalEntry.findUnique({
      where: { id },
      include: {
        journal: true,
        lines: {
          include: { account: true, analyticAccount: true },
        },
      },
    });
    if (!entry) throw new NotFoundException(`Journal entry ${id} not found`);
    return entry;
  }

  async createEntry(data: {
    journalId: string; date: string; ref?: string;
    lines: Array<{
      accountId: string; debit?: number; credit?: number;
      label?: string; analyticAccountId?: string;
    }>;
  }, userId: string) {
    this.validateLines(data.lines);

    const entry = await this.prisma.journalEntry.create({
      data: {
        journalId: data.journalId,
        date: new Date(data.date),
        ref: data.ref,
        status: 'DRAFT',
        lines: {
          create: data.lines.map((l) => ({
            accountId: l.accountId,
            debit: l.debit ?? 0,
            credit: l.credit ?? 0,
            label: l.label,
            analyticAccountId: l.analyticAccountId,
          })),
        },
      },
      include: { lines: { include: { account: true } } },
    });
    await this.audit.log({ entity: 'JournalEntry', entityId: entry.id, action: 'CREATE', userId, newValue: entry });
    return entry;
  }

  async postEntry(id: string, userId: string) {
    const entry = await this.prisma.journalEntry.findUniqueOrThrow({
      where: { id },
      include: { lines: true },
    });
    if (entry.status === 'POSTED') throw new BadRequestException('Entry already posted');

    const posted = await this.prisma.journalEntry.update({
      where: { id },
      data: { status: 'POSTED' },
    });
    await this.audit.log({ entity: 'JournalEntry', entityId: id, action: 'POST', userId });
    return posted;
  }

  async reverseEntry(id: string, userId: string) {
    const entry = await this.getEntry(id);
    if (entry.status !== 'POSTED') throw new BadRequestException('Only posted entries can be reversed');
    if (entry.reversedEntryId) throw new BadRequestException('Entry already reversed');

    const reversal = await this.prisma.$transaction(async (tx) => {
      const rev = await tx.journalEntry.create({
        data: {
          journalId: entry.journalId,
          date: new Date(),
          ref: `REV-${entry.ref ?? entry.id.slice(-8)}`,
          status: 'POSTED',
          reversedEntryId: entry.id,
          lines: {
            create: entry.lines.map((l) => ({
              accountId: l.accountId,
              debit: Number(l.credit),
              credit: Number(l.debit),
              label: l.label,
              analyticAccountId: l.analyticAccountId,
            })),
          },
        },
      });
      return rev;
    });
    await this.audit.log({ entity: 'JournalEntry', entityId: id, action: 'REVERSE', userId, newValue: { reversalId: reversal.id } });
    return reversal;
  }

  // -- Trial Balance --
  // JournalEntry has no companyId → filter via journal.companyId

  async trialBalance(companyId: string, dateFrom: string, dateTo: string) {
    const lines = await this.prisma.journalEntryLine.findMany({
      where: {
        journalEntry: {
          journal: { companyId },
          status: 'POSTED',
          date: { gte: new Date(dateFrom), lte: new Date(dateTo) },
        },
      },
      include: { account: { select: { id: true, code: true, name: true, type: true } } },
    });

    const map = new Map<string, {
      account: any; debit: number; credit: number; balance: number;
    }>();
    for (const l of lines) {
      const key = l.accountId;
      if (!map.has(key)) {
        map.set(key, { account: l.account, debit: 0, credit: 0, balance: 0 });
      }
      const row = map.get(key)!;
      row.debit += Number(l.debit);
      row.credit += Number(l.credit);
      row.balance = row.debit - row.credit;
    }
    return [...map.values()].sort((a, b) => a.account.code.localeCompare(b.account.code));
  }

  // -- Private helpers --

  private validateLines(lines: Array<{ debit?: number; credit?: number }>) {
    const totalDebit = lines.reduce((s, l) => s + (l.debit ?? 0), 0);
    const totalCredit = lines.reduce((s, l) => s + (l.credit ?? 0), 0);
    if (Math.abs(totalDebit - totalCredit) > 0.01) {
      throw new BadRequestException(
        `Journal entry not balanced: debits ${totalDebit} != credits ${totalCredit}`,
      );
    }
  }
}
