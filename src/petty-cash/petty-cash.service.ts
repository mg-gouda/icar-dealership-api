import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { FiscalPeriodService } from '../finance/fiscal-periods/fiscal-period.service';

@Injectable()
export class PettyCashService {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
    private fiscalPeriodService: FiscalPeriodService,
  ) {}

  // ── Funds ────────────────────────────────────────────────────────────────

  async listFunds(companyId: string, query: { locationId?: string; page?: number; limit?: number }) {
    const { locationId, page = 1, limit = 20 } = query;
    const where = {
      companyId,
      ...(locationId && { locationId }),
    };
    const [data, total] = await this.prisma.$transaction([
      this.prisma.pettyCashFund.findMany({
        where,
        include: {
          location: { select: { id: true, name: true } },
          custodian: { select: { id: true, name: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (Number(page) - 1) * Number(limit),
        take: Number(limit),
      }),
      this.prisma.pettyCashFund.count({ where }),
    ]);
    return { data, total, page: Number(page), limit: Number(limit) };
  }

  async createFund(
    companyId: string,
    data: {
      name: string;
      locationId: string;
      custodianId: string;
      balance?: number;
    },
    userId: string,
  ) {
    const fund = await this.prisma.pettyCashFund.create({
      data: {
        name: data.name,
        locationId: data.locationId,
        custodianId: data.custodianId,
        balance: data.balance ?? 0,
        companyId,
      },
    });
    await this.audit.log({
      entity: 'PettyCashFund',
      entityId: fund.id,
      action: 'CREATE',
      userId,
      newValue: fund,
    });
    return fund;
  }

  async updateFund(
    companyId: string,
    id: string,
    body: { name?: string; custodianId?: string; isActive?: boolean; replenishAmount?: number },
    userId: string,
  ) {
    const fund = await this.prisma.pettyCashFund.findUniqueOrThrow({ where: { id } });

    // ── Replenish flow ────────────────────────────────────────────────────
    if (body.replenishAmount && body.replenishAmount > 0) {
      return this.replenishFund(companyId, fund, body.replenishAmount, userId);
    }

    // ── Normal field update ───────────────────────────────────────────────
    const { replenishAmount: _, ...updateData } = body;
    const updated = await this.prisma.pettyCashFund.update({
      where: { id },
      data: updateData as any,
    });
    await this.audit.log({
      entity: 'PettyCashFund',
      entityId: id,
      action: 'UPDATE',
      userId,
      newValue: updateData,
    });
    return updated;
  }

  private async replenishFund(
    companyId: string,
    fund: { id: string; locationId: string; balance: any },
    amount: number,
    userId: string,
  ) {
    // ponytail: find accounts by code — 1100 = Cash, 1110 = Petty Cash
    const cashAccount = await this.prisma.account.findFirst({
      where: { companyId, type: { in: ['ASSET'] }, code: '1100' },
    });
    const replenishAccount = await this.prisma.account.findFirst({
      where: { companyId, type: 'ASSET', code: '1110' },
    });
    if (!cashAccount || !replenishAccount) {
      throw new BadRequestException(
        'GL accounts 1100 (Cash) or 1110 (Petty Cash) not found. Run seed.',
      );
    }

    const journal = await this.prisma.journal.findFirst({
      where: { locationId: fund.locationId, type: { in: ['CASH', 'GENERAL'] } },
    });
    if (!journal) {
      throw new BadRequestException('No CASH/GENERAL journal on location');
    }

    const now = new Date();
    await this.fiscalPeriodService.assertOpen(now, companyId);
    const updated = await this.prisma.$transaction(async (tx) => {
      const result = await tx.pettyCashFund.update({
        where: { id: fund.id },
        data: { balance: { increment: amount } },
      });

      // DR Petty Cash (1020) / CR Main Cash (1010)
      await tx.journalEntry.create({
        data: {
          journalId: journal.id,
          date: now,
          ref: `PCREPL-${fund.id.slice(-8).toUpperCase()}`,
          status: 'POSTED',
          lines: {
            create: [
              {
                accountId: replenishAccount.id,
                debit: amount,
                credit: 0,
                label: 'Petty Cash Replenishment',
              },
              {
                accountId: cashAccount.id,
                debit: 0,
                credit: amount,
                label: 'Cash Disbursed for Petty Cash',
              },
            ],
          },
        },
      });

      return result;
    });

    await this.audit.log({
      entity: 'PettyCashFund',
      entityId: fund.id,
      action: 'PETTY_CASH_REPLENISHED',
      userId,
      newValue: { replenishAmount: amount, newBalance: Number(updated.balance) },
    });
    return updated;
  }

  // ── Vouchers ─────────────────────────────────────────────────────────────

  async listVouchers(companyId: string, query: {
    fundId?: string;
    status?: string;
    submittedBy?: string;
    page?: number;
    limit?: number;
  }) {
    const { fundId, status, submittedBy, page = 1, limit = 20 } = query;
    const where = {
      companyId,
      ...(fundId && { fundId }),
      ...(status && { status: status as any }),
      ...(submittedBy && { submittedBy }),
    };
    const [data, total] = await this.prisma.$transaction([
      this.prisma.pettyCashVoucher.findMany({
        where,
        include: {
          fund: { select: { id: true, name: true } },
          submitter: { select: { id: true, name: true } },
          approver: { select: { id: true, name: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (Number(page) - 1) * Number(limit),
        take: Number(limit),
      }),
      this.prisma.pettyCashVoucher.count({ where }),
    ]);
    return { data, total, page: Number(page), limit: Number(limit) };
  }

  async submitVoucher(
    companyId: string,
    data: {
      fundId: string;
      amount: number;
      description: string;
      category?: string;
      receiptUrl?: string;
    },
    userId: string,
  ) {
    // Verify fund exists
    await this.prisma.pettyCashFund.findUniqueOrThrow({ where: { id: data.fundId } });

    const voucher = await this.prisma.pettyCashVoucher.create({
      data: {
        fundId: data.fundId,
        amount: data.amount,
        description: data.description,
        category: data.category,
        receiptUrl: data.receiptUrl,
        submittedBy: userId,
        companyId,
        status: 'PENDING',
      },
    });
    await this.audit.log({
      entity: 'PettyCashVoucher',
      entityId: voucher.id,
      action: 'SUBMIT',
      userId,
      newValue: voucher,
    });
    return voucher;
  }

  async approveVoucher(companyId: string, id: string, userId: string) {
    const voucher = await this.prisma.pettyCashVoucher.findUniqueOrThrow({
      where: { id },
      include: { fund: true },
    });
    if (voucher.status !== 'PENDING') {
      throw new BadRequestException(`Voucher status is ${voucher.status}, expected PENDING`);
    }

    const voucherAmount = Number(voucher.amount);
    const fundBalance = Number(voucher.fund.balance);
    if (fundBalance < voucherAmount) {
      throw new BadRequestException(
        `Insufficient fund balance (${fundBalance}) for voucher amount (${voucherAmount})`,
      );
    }

    // Resolve GL accounts
    const expenseAccount = await this.prisma.account.findFirst({
      where: { companyId, type: 'EXPENSE' },
    });
    const cashAccount = await this.prisma.account.findFirst({
      where: { companyId, type: 'ASSET', code: '1100' },
    });
    if (!expenseAccount || !cashAccount) {
      throw new BadRequestException(
        'GL accounts for EXPENSE or Cash (1100) not found. Run seed.',
      );
    }

    const journal = await this.prisma.journal.findFirst({
      where: { locationId: voucher.fund.locationId, type: { in: ['CASH', 'GENERAL'] } },
    });
    if (!journal) {
      throw new BadRequestException('No CASH/GENERAL journal on location');
    }

    const now = new Date();
    await this.fiscalPeriodService.assertOpen(now, companyId);
    const result = await this.prisma.$transaction(async (tx) => {
      // 1. Decrement fund balance
      await tx.pettyCashFund.update({
        where: { id: voucher.fundId },
        data: { balance: { decrement: voucherAmount } },
      });

      // 2. GL entry: DR Expense / CR Cash
      const entry = await tx.journalEntry.create({
        data: {
          journalId: journal.id,
          date: now,
          ref: `PC-${id.slice(-8).toUpperCase()}`,
          status: 'POSTED',
          lines: {
            create: [
              {
                accountId: expenseAccount.id,
                debit: voucherAmount,
                credit: 0,
                label: `Petty Cash: ${voucher.description}`,
              },
              {
                accountId: cashAccount.id,
                debit: 0,
                credit: voucherAmount,
                label: 'Petty Cash Disbursement',
              },
            ],
          },
        },
      });

      // 3. Update voucher → POSTED with journalEntryId
      return tx.pettyCashVoucher.update({
        where: { id },
        data: {
          status: 'POSTED',
          approvedBy: userId,
          journalEntryId: entry.id,
        },
      });
    });

    await this.audit.log({
      entity: 'PettyCashVoucher',
      entityId: id,
      action: 'PETTY_CASH_APPROVED',
      userId,
    });
    return result;
  }

  async rejectVoucher(id: string, userId: string) {
    const voucher = await this.prisma.pettyCashVoucher.findUniqueOrThrow({ where: { id } });
    if (voucher.status !== 'PENDING') {
      throw new BadRequestException(`Voucher status is ${voucher.status}, expected PENDING`);
    }

    const result = await this.prisma.pettyCashVoucher.update({
      where: { id },
      data: { status: 'REJECTED', approvedBy: userId },
    });
    await this.audit.log({
      entity: 'PettyCashVoucher',
      entityId: id,
      action: 'REJECT',
      userId,
    });
    return result;
  }
}
