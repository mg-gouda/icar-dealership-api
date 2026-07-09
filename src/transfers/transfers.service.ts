import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { FiscalPeriodService } from '../finance/fiscal-periods/fiscal-period.service';

@Injectable()
export class TransfersService {
  // ponytail: hardcoded until multi-company support lands
  private readonly companyId = 'company-001';

  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
    private fiscalPeriodService: FiscalPeriodService,
  ) {}

  async createTransfer(
    data: {
      fromLocationId: string;
      toLocationId: string;
      amount: number;
      description?: string;
      journalDate?: string;
    },
    userId: string,
  ) {
    if (data.fromLocationId === data.toLocationId) {
      throw new BadRequestException('Source and destination locations must differ.');
    }
    if (!data.amount || data.amount <= 0) {
      throw new BadRequestException('Transfer amount must be positive.');
    }

    const amount = Number(data.amount);
    const journalDate = data.journalDate ? new Date(data.journalDate) : new Date();
    const refSuffix = `${journalDate.toISOString().slice(0, 10).replace(/-/g, '')}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
    const ref = `XFER-${refSuffix}`;

    // Resolve journals for both locations (prefer BANK type)
    const [fromJournal, toJournal] = await Promise.all([
      this.findLocationJournal(data.fromLocationId),
      this.findLocationJournal(data.toLocationId),
    ]);

    // Resolve accounts by code:
    // 1310 = Inter-Location Receivable (Due From), 2310 = Inter-Location Payable (Due To)
    // 1200 = Bank/Cash (fallback to 1100)
    const acctRows = await this.prisma.account.findMany({
      where: { companyId: this.companyId, code: { in: ['1310', '2310', '1200', '1100'] } },
      select: { id: true, code: true },
    });
    const acctMap: Record<string, string> = {};
    for (const r of acctRows) acctMap[r.code] = r.id;

    const receivableAcctId = acctMap['1310'] ?? acctMap['1300']; // fallback to AR
    const payableAcctId = acctMap['2310'] ?? acctMap['2100']; // fallback to AP
    const bankAcctId = acctMap['1200'] ?? acctMap['1100'];

    if (!receivableAcctId || !payableAcctId || !bankAcctId) {
      // Fallback: try broader lookup by type
      const fallback = await this.prisma.account.findMany({
        where: { companyId: this.companyId, type: { in: ['ASSET', 'LIABILITY'] } },
        select: { id: true, code: true, type: true },
        orderBy: { code: 'asc' },
      });
      throw new BadRequestException(
        `Missing required GL accounts for transfers (need codes 1310, 2310, 1200). Found ${fallback.length} accounts. Run prisma:seed first.`,
      );
    }

    // Fiscal period gate before posting
    await this.fiscalPeriodService.assertOpen(journalDate, this.companyId);

    // Atomic: create both journal entries in one transaction
    const result = await this.prisma.$transaction(async (tx) => {
      // JE 1: fromLocation journal
      // DR: Due From [toLocation] (RECEIVABLE) / CR: Bank/Cash (fromLocation)
      const fromJE = await tx.journalEntry.create({
        data: {
          journalId: fromJournal.id,
          date: journalDate,
          ref,
          status: 'POSTED',
          lines: {
            create: [
              {
                accountId: receivableAcctId,
                debit: amount,
                credit: 0,
                label: `Inter-location transfer to ${data.toLocationId}`,
              },
              {
                accountId: bankAcctId,
                debit: 0,
                credit: amount,
                label: `Cash out - transfer to ${data.toLocationId}`,
              },
            ],
          },
        },
      });

      // JE 2: toLocation journal
      // DR: Bank/Cash (toLocation) / CR: Due To [fromLocation] (PAYABLE)
      const toJE = await tx.journalEntry.create({
        data: {
          journalId: toJournal.id,
          date: journalDate,
          ref,
          status: 'POSTED',
          lines: {
            create: [
              {
                accountId: bankAcctId,
                debit: amount,
                credit: 0,
                label: `Cash in - transfer from ${data.fromLocationId}`,
              },
              {
                accountId: payableAcctId,
                debit: 0,
                credit: amount,
                label: `Inter-location transfer from ${data.fromLocationId}`,
              },
            ],
          },
        },
      });

      return { fromJournalEntryId: fromJE.id, toJournalEntryId: toJE.id };
    });

    await this.audit.log({
      entity: 'JournalEntry',
      entityId: result.fromJournalEntryId,
      action: 'TRANSFER_POSTED',
      userId,
      newValue: {
        fromLocationId: data.fromLocationId,
        toLocationId: data.toLocationId,
        amount,
        ref,
        fromJournalEntryId: result.fromJournalEntryId,
        toJournalEntryId: result.toJournalEntryId,
      },
    });

    return {
      ...result,
      amount,
      description: data.description ?? ref,
    };
  }

  async findAll(query: { locationId?: string; page?: number; limit?: number }) {
    const { locationId, page = 1, limit = 20 } = query;

    // Transfer JEs are identified by ref starting with "XFER-"
    const where: any = { ref: { startsWith: 'XFER-' } };
    if (locationId) {
      where.journal = { locationId };
    }

    const [data, total] = await this.prisma.$transaction([
      this.prisma.journalEntry.findMany({
        where,
        include: {
          journal: { select: { id: true, name: true, locationId: true } },
          lines: {
            select: { accountId: true, debit: true, credit: true, label: true },
          },
        },
        orderBy: { date: 'desc' },
        skip: (Number(page) - 1) * Number(limit),
        take: Number(limit),
      }),
      this.prisma.journalEntry.count({ where }),
    ]);
    return { data, total, page: Number(page), limit: Number(limit) };
  }

  private async findLocationJournal(locationId: string) {
    // Prefer BANK journal for the location, fallback to any journal at that location
    const journal =
      (await this.prisma.journal.findFirst({
        where: { locationId, type: 'BANK' },
        select: { id: true },
      })) ??
      (await this.prisma.journal.findFirst({
        where: { locationId },
        select: { id: true },
      }));

    if (!journal) {
      throw new BadRequestException(
        `No journal found for location ${locationId}. Ensure location has journals seeded.`,
      );
    }
    return journal;
  }
}
