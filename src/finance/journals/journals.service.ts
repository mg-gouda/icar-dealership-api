import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { Prisma, JournalType } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuditService } from '../../audit/audit.service';

@Injectable()
export class JournalsService {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
  ) {}

  async list(companyId: string, query: { type?: string; locationId?: string }) {
    const where: Prisma.JournalWhereInput = { companyId };
    if (query.type) where.type = query.type as JournalType;
    if (query.locationId) where.locationId = query.locationId;

    return this.prisma.journal.findMany({
      where,
      include: {
        defaultDebitAccount: { select: { id: true, code: true, name: true } },
        defaultCreditAccount: { select: { id: true, code: true, name: true } },
        currency: true,
        location: { select: { id: true, name: true } },
      },
      orderBy: { code: 'asc' },
    });
  }

  async getById(id: string, companyId: string) {
    const journal = await this.prisma.journal.findFirst({
      where: { id, companyId },
      include: {
        defaultDebitAccount: { select: { id: true, code: true, name: true } },
        defaultCreditAccount: { select: { id: true, code: true, name: true } },
        currency: true,
        location: { select: { id: true, name: true } },
        bankAccount: true,
      },
    });
    if (!journal) throw new NotFoundException('Journal not found');
    return journal;
  }

  async create(
    data: {
      companyId: string;
      name: string;
      code: string;
      type: string;
      locationId?: string;
      defaultDebitAccountId?: string;
      defaultCreditAccountId?: string;
      currencyId?: string;
      sequencePrefix?: string;
      bankAccountId?: string;
    },
    userId: string,
  ) {
    const existing = await this.prisma.journal.findFirst({
      where: { companyId: data.companyId, code: data.code },
    });
    if (existing)
      throw new BadRequestException(`Journal code ${data.code} already exists`);

    const createData: Prisma.JournalUncheckedCreateInput = {
      companyId: data.companyId,
      name: data.name,
      code: data.code,
      type: data.type as JournalType,
      locationId: data.locationId ?? null,
      defaultDebitAccountId: data.defaultDebitAccountId ?? null,
      defaultCreditAccountId: data.defaultCreditAccountId ?? null,
      currencyId: data.currencyId ?? null,
      sequencePrefix: data.sequencePrefix ?? null,
      bankAccountId: data.bankAccountId ?? null,
    };
    const journal = await this.prisma.journal.create({ data: createData });
    await this.audit.log({
      userId,
      action: 'CREATE',
      entity: 'Journal',
      entityId: journal.id,
    });
    return journal;
  }

  async update(
    id: string,
    companyId: string,
    data: {
      name?: string;
      type?: string;
      locationId?: string | null;
      defaultDebitAccountId?: string | null;
      defaultCreditAccountId?: string | null;
      currencyId?: string | null;
      sequencePrefix?: string | null;
    },
    userId: string,
  ) {
    const journal = await this.prisma.journal.findFirst({
      where: { id, companyId },
    });
    if (!journal) throw new NotFoundException('Journal not found');

    const updateData: Prisma.JournalUncheckedUpdateInput = {
      ...(data.name !== undefined && { name: data.name }),
      ...(data.type !== undefined && { type: data.type as JournalType }),
      ...(data.locationId !== undefined && { locationId: data.locationId }),
      ...(data.defaultDebitAccountId !== undefined && { defaultDebitAccountId: data.defaultDebitAccountId }),
      ...(data.defaultCreditAccountId !== undefined && { defaultCreditAccountId: data.defaultCreditAccountId }),
      ...(data.currencyId !== undefined && { currencyId: data.currencyId }),
      ...(data.sequencePrefix !== undefined && { sequencePrefix: data.sequencePrefix }),
    };
    const updated = await this.prisma.journal.update({
      where: { id },
      data: updateData,
    });
    await this.audit.log({
      userId,
      action: 'UPDATE',
      entity: 'Journal',
      entityId: id,
      changes: { before: journal, after: updated },
    });
    return updated;
  }

  async delete(id: string, companyId: string, userId: string) {
    const journal = await this.prisma.journal.findFirst({
      where: { id, companyId },
    });
    if (!journal) throw new NotFoundException('Journal not found');

    const entryCount = await this.prisma.journalEntry.count({
      where: { journalId: id },
    });
    if (entryCount > 0) {
      throw new BadRequestException(
        `Cannot delete journal with ${entryCount} journal entries. Archive it instead.`,
      );
    }

    await this.prisma.journal.delete({ where: { id } });
    await this.audit.log({
      userId,
      action: 'DELETE',
      entity: 'Journal',
      entityId: id,
    });
    return { deleted: true };
  }
}
