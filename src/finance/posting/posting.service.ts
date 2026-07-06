import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import Decimal from 'decimal.js';

const VAT_RATE = 0.14;

/**
 * All GL postings go through this service -- never create JournalEntry rows
 * directly from other modules. Enforces audit + fiscal-period validation.
 */
@Injectable()
export class PostingService {
  constructor(private prisma: PrismaService) {}

  // -- FIX C6: Balance validation before every journal entry --
  private assertBalanced(
    lines: Array<{ debit: number | Decimal; credit: number | Decimal }>,
  ) {
    const totalDebit = lines.reduce(
      (s, l) => s.plus(new Decimal(l.debit.toString())),
      new Decimal(0),
    );
    const totalCredit = lines.reduce(
      (s, l) => s.plus(new Decimal(l.credit.toString())),
      new Decimal(0),
    );
    if (!totalDebit.equals(totalCredit)) {
      throw new Error(
        `Journal entry is unbalanced: DR ${totalDebit} ≠ CR ${totalCredit}`,
      );
    }
  }

  // -- Deal Finalize --

  async finalizeDeal(dealId: string, userId: string): Promise<void> {
    const deal = await this.prisma.deal.findUniqueOrThrow({
      where: { id: dealId },
      include: {
        vehicle: true,
        tradeInVehicle: true,
        location: {
          include: {
            journals: true,
            analyticAccount: true,
          },
        },
        customer: { include: { partner: true } },
        commissions: true,
      },
    });

    // Vehicle has no companyId → get from location.company via journal
    const saleJournal = deal.location.journals.find((j) => j.type === 'SALE');
    const generalJournal = deal.location.journals.find(
      (j) => j.type === 'GENERAL',
    );
    if (!saleJournal || !generalJournal) {
      throw new BadRequestException(
        'Location is missing SALE or GENERAL journal. Run seed first.',
      );
    }

    const companyId = saleJournal.companyId;
    const now = new Date();
    await this.assertFiscalPeriodOpen(now, companyId);

    const accounts = await this.resolveAccounts(companyId, [
      '1300',
      '4100',
      '4210',
      '4220',
      '2200',
      '5100',
      '1400',
      '1410',
    ]);

    const salePrice = Number(deal.salePrice);
    const adminFee = Number(deal.adminFee ?? 0);
    const insuranceFee = Number(deal.insuranceFee ?? 0);
    const vehicleCost = Number(deal.vehicle.cost ?? 0);

    // VAT applies only on salePrice per Egypt spec (admin fee + insurance exempt)
    const vatAmount = Math.round(salePrice * VAT_RATE * 100) / 100;
    const totalAR = salePrice + vatAmount + adminFee + insuranceFee;

    const analyticAccountId = deal.location.analyticAccount?.id;

    await this.prisma.$transaction(async (tx) => {
      // 1. Sale GL entry lines (SALE journal)
      // DR: AR 1300 / CR: Vehicle Sales Income 4100 + VAT Payable 2200 + Admin Fee 4210 + Insurance 4220
      const saleLines = [
        {
          accountId: accounts['1300'],
          debit: totalAR,
          credit: 0,
          label: `AR - Deal ${dealId}`,
          analyticAccountId,
        },
        {
          accountId: accounts['4100'],
          debit: 0,
          credit: salePrice,
          label: 'Vehicle Sales Income',
          analyticAccountId,
        },
        ...(vatAmount > 0
          ? [
              {
                accountId: accounts['2200'],
                debit: 0,
                credit: vatAmount,
                label: 'VAT 14%',
                analyticAccountId,
              },
            ]
          : []),
        ...(adminFee > 0
          ? [
              {
                accountId: accounts['4210'],
                debit: 0,
                credit: adminFee,
                label: 'Admin Fee',
                analyticAccountId,
              },
            ]
          : []),
        ...(insuranceFee > 0
          ? [
              {
                accountId: accounts['4220'],
                debit: 0,
                credit: insuranceFee,
                label: 'Compulsory Insurance',
                analyticAccountId,
              },
            ]
          : []),
      ];

      this.assertBalanced(saleLines);
      await tx.journalEntry.create({
        data: {
          journalId: saleJournal.id,
          date: now,
          ref: `SALE-${dealId.slice(-8).toUpperCase()}`,
          status: 'POSTED',
          lines: {
            create: saleLines,
          },
        },
      });

      // 2. COGS entry (GENERAL journal)
      // DR: COGS-Vehicle 5100 / CR: Vehicle Inventory 1400 or 1410
      if (vehicleCost > 0) {
        // ponytail: no `condition` field on Vehicle; use inventory account 1400
        const cogsLines = [
          {
            accountId: accounts['5100'],
            debit: vehicleCost,
            credit: 0,
            label: 'COGS - Vehicle',
            analyticAccountId,
          },
          {
            accountId: accounts['1400'],
            debit: 0,
            credit: vehicleCost,
            label: 'Vehicle Inventory',
            analyticAccountId,
          },
        ];
        this.assertBalanced(cogsLines);
        await tx.journalEntry.create({
          data: {
            journalId: generalJournal.id,
            date: now,
            ref: `COGS-${dealId.slice(-8).toUpperCase()}`,
            status: 'POSTED',
            lines: {
              create: cogsLines,
            },
          },
        });
      }

      // 3. Create DRAFT invoice for the deal (finance reviews + posts)
      // FIX C5: was POSTED → now DRAFT so finance team must explicitly post
      const partnerId = deal.customer.partnerId;
      if (!partnerId) {
        throw new BadRequestException(
          'Customer has no linked Partner record — cannot create invoice. Link a Partner to the customer first.',
        );
      }

      // Lookup VAT tax for vehicle sale line
      const vatTax = await tx.tax.findFirst({
        where: { accountId: accounts['2200'], scope: 'SALE' },
      });

      const vehicleDesc = `Vehicle sale — ${deal.vehicle.make} ${deal.vehicle.model} ${deal.vehicle.year}`;
      const invoiceLines: Array<{
        description: string;
        category: string;
        accountId: string;
        quantity: number;
        unitPrice: number;
        discount: number;
        subtotal: number;
        taxId?: string;
        vehicleId?: string;
      }> = [
        {
          description: vehicleDesc,
          category: 'VEHICLE',
          accountId: accounts['4100'],
          quantity: 1,
          unitPrice: salePrice,
          discount: 0,
          subtotal: salePrice,
          taxId: vatTax?.id,
          vehicleId: deal.vehicleId,
        },
      ];
      if (adminFee > 0) {
        invoiceLines.push({
          description: 'Admin Fee',
          category: 'ADMIN_FEE',
          accountId: accounts['4210'],
          quantity: 1,
          unitPrice: adminFee,
          discount: 0,
          subtotal: adminFee,
        });
      }
      if (insuranceFee > 0) {
        invoiceLines.push({
          description: 'Compulsory Insurance',
          category: 'COMPULSORY_INSURANCE',
          accountId: accounts['4220'],
          quantity: 1,
          unitPrice: insuranceFee,
          discount: 0,
          subtotal: insuranceFee,
        });
      }

      const amountUntaxed = salePrice + adminFee + insuranceFee;
      // FIX C5: status DRAFT (not POSTED) — finance must review + post via postInvoice()
      // TODO: full refactor — move sale GL + COGS GL into postInvoice() for deal invoices.
      // Currently kept here to avoid breaking commission accrual timing (commissions accrue at finalize per spec).
      const invoice = await tx.invoice.create({
        data: {
          type: 'CUSTOMER_INVOICE',
          status: 'DRAFT',
          journalId: saleJournal.id,
          partnerId,
          dealId: deal.id,
          date: now,
          dueDate: now,
          amountUntaxed,
          amountTax: vatAmount,
          amountTotal: totalAR,
          amountResidual: totalAR,
          lines: { create: invoiceLines },
        },
      });

      // 4. Update vehicle status -> SOLD
      await tx.vehicle.update({
        where: { id: deal.vehicleId },
        data: { status: 'SOLD' },
      });

      // 4a. Auto-create trade-in Vehicle if text fields present but no FK yet
      // ponytail: only when tradeInVehicleId is NULL -- avoids double-post with 4b below
      if (
        !deal.tradeInVehicleId &&
        deal.tradeInMake &&
        deal.tradeInModel &&
        Number(deal.tradeInValue ?? 0) > 0
      ) {
        const tradeInVin = `TRADE-${dealId.slice(-12).toUpperCase()}-${Date.now().toString(36).toUpperCase()}`;
        const tradeInVehicle = await tx.vehicle.create({
          data: {
            vin: tradeInVin,
            make: deal.tradeInMake,
            model: deal.tradeInModel,
            year: deal.tradeInYear ?? new Date().getFullYear(),
            status: 'AVAILABLE',
            locationId: deal.location.id,
            cost: deal.tradeInValue!,
            price: deal.tradeInValue!,
          },
        });
        await tx.deal.update({
          where: { id: dealId },
          data: { tradeInVehicleId: tradeInVehicle.id },
        });
        // Patch local reference so the 4b block picks it up
        (deal as any).tradeInVehicleId = tradeInVehicle.id;
      }

      // 4b. Trade-in vehicle GL entry -- DR Used Vehicle Inventory (1410), CR AR (1300)
      const tradeInValue = Number(deal.tradeInValue ?? 0);
      if (tradeInValue > 0 && deal.tradeInVehicleId) {
        const tradeInLines = [
          {
            accountId: accounts['1410'],
            debit: tradeInValue,
            credit: 0,
            label: 'Trade-In Vehicle Inventory',
            analyticAccountId,
          },
          {
            accountId: accounts['1300'],
            debit: 0,
            credit: tradeInValue,
            label: 'Trade-In Credit - AR Reduction',
            analyticAccountId,
          },
        ];
        this.assertBalanced(tradeInLines);
        await tx.journalEntry.create({
          data: {
            journalId: generalJournal.id,
            date: now,
            ref: `TRADE-${dealId.slice(-8).toUpperCase()}`,
            status: 'POSTED',
            lines: {
              create: tradeInLines,
            },
          },
        });
        // Mark trade-in vehicle as AVAILABLE (now part of dealership inventory)
        await tx.vehicle.update({
          where: { id: deal.tradeInVehicleId },
          data: { status: 'AVAILABLE' },
        });
        // F-8: Reduce invoice amountResidual by trade-in value
        await tx.invoice.update({
          where: { id: invoice.id },
          data: { amountResidual: totalAR - tradeInValue },
        });
      }

      // 5. Update deal status -> FINALIZED
      await tx.deal.update({
        where: { id: dealId },
        data: { status: 'FINALIZED' },
      });

      // 6. Accrue commissions (per commission records already on deal)
      for (const commission of deal.commissions) {
        if (commission.status !== 'ACCRUED') continue;
        await this.accrueCommission(
          commission.id,
          userId,
          tx as any,
          companyId,
          generalJournal.id,
          accounts,
          analyticAccountId,
        );
      }
    });
  }

  // -- Installment Payment --

  async postInstallment(
    installmentLineId: string,
    userId: string,
  ): Promise<void> {
    const line = await this.prisma.installmentLine.findUniqueOrThrow({
      where: { id: installmentLineId },
      include: {
        installmentPlan: {
          include: {
            deal: {
              include: {
                location: {
                  include: { journals: true, analyticAccount: true },
                },
              },
            },
          },
        },
      },
    });

    const deal = line.installmentPlan.deal;
    const cashJournal = deal.location.journals.find(
      (j) => j.type === 'CASH' || j.type === 'BANK',
    );
    if (!cashJournal)
      throw new BadRequestException('No CASH/BANK journal on location');

    const companyId = cashJournal.companyId;
    const now = new Date();
    await this.assertFiscalPeriodOpen(now, companyId);

    // F-11: Use journal's default debit account instead of hardcoded '1100'
    const cashDebitAccountId = cashJournal.defaultDebitAccountId;
    if (!cashDebitAccountId)
      throw new BadRequestException('CASH/BANK journal has no default debit account — configure it first');
    const accounts = await this.resolveAccounts(companyId, ['1300', '4300']);
    const analyticAccountId = deal.location.analyticAccount?.id;

    const principal = Number(line.principalPortion);
    const interest = Number(line.interestPortion);
    const totalDue = Number(line.totalDue);

    const instLines = [
      {
        accountId: cashDebitAccountId,
        debit: totalDue,
        credit: 0,
        label: 'Installment Received',
        analyticAccountId,
      },
      {
        accountId: accounts['1300'],
        debit: 0,
        credit: principal,
        label: 'Clear AR — Principal',
        analyticAccountId,
      },
      ...(interest > 0
        ? [
            {
              accountId: accounts['4300'],
              debit: 0,
              credit: interest,
              label: 'Interest Income',
              analyticAccountId,
            },
          ]
        : []),
    ];

    await this.prisma.$transaction(async (tx) => {
      this.assertBalanced(instLines);
      await tx.journalEntry.create({
        data: {
          journalId: cashJournal.id,
          date: now,
          ref: `INST-${installmentLineId.slice(-8).toUpperCase()}`,
          status: 'POSTED',
          lines: {
            create: instLines,
          },
        },
      });

      await tx.installmentLine.update({
        where: { id: installmentLineId },
        data: {
          status: 'PAID',
          paidAmount: Number(line.totalDue),
          paidDate: now,
        },
      });

      // Auto-mark commissions PAYABLE on first installment collected
      const paidCount = await tx.installmentLine.count({
        where: { installmentPlanId: line.installmentPlan.id, status: 'PAID' },
      });
      if (paidCount === 1) {
        await tx.dealCommission.updateMany({
          where: { dealId: line.installmentPlan.dealId, status: 'ACCRUED' },
          data: { status: 'PAYABLE', payableAt: now },
        });
      }
    });
  }

  // -- Bank Financing Disbursement --
  // FIX C7: shortfall leaves remaining AR open; overage throws for manual review

  async postBankDisbursement(dealId: string, userId: string): Promise<void> {
    const deal = await this.prisma.deal.findUniqueOrThrow({
      where: { id: dealId },
      include: {
        financeApplication: { include: { bankApproval: true } },
        location: { include: { journals: true, analyticAccount: true } },
      },
    });

    const bankApproval = deal.financeApplication?.bankApproval;
    if (!bankApproval)
      throw new BadRequestException('No bank approval record on deal');

    const bankJournal = deal.location.journals.find((j) => j.type === 'BANK');
    if (!bankJournal)
      throw new BadRequestException('No BANK journal on location');

    const companyId = bankJournal.companyId;
    const now = new Date();
    await this.assertFiscalPeriodOpen(now, companyId);

    // F-12: Use journal's default debit account instead of hardcoded '1200'
    const bankDebitAccountId = bankJournal.defaultDebitAccountId;
    if (!bankDebitAccountId)
      throw new BadRequestException('BANK journal has no default debit account — configure it first');
    const accounts = await this.resolveAccounts(companyId, ['1300']);
    const analyticAccountId = deal.location.analyticAccount?.id;

    const approvedAmount = Number(bankApproval.approvedAmount);
    const saleTotal =
      Number(deal.salePrice) * (1 + VAT_RATE) +
      Number(deal.adminFee ?? 0) +
      Number(deal.insuranceFee ?? 0);

    // FIX C7: overage → reject; shortfall → only credit AR for approvedAmount (remaining AR stays open)
    if (approvedAmount > saleTotal) {
      throw new BadRequestException(
        'Bank disbursement overage requires manual finance review. Reduce the approved amount to match the invoice total or contact finance.',
      );
    }

    // Per spec 06: DR Bank approvedAmount / CR AR approvedAmount
    // Shortfall (saleTotal - approvedAmount) remains as open AR for customer to pay
    const lines = [
      {
        accountId: bankDebitAccountId,
        debit: approvedAmount,
        credit: 0,
        label: 'Bank disbursement received',
        analyticAccountId,
      },
      {
        accountId: accounts['1300'],
        debit: 0,
        credit: approvedAmount,
        label: `Clear AR — bank disbursement${approvedAmount < saleTotal ? ' (partial — shortfall remains on AR)' : ''}`,
        analyticAccountId,
      },
    ];

    this.assertBalanced(lines);
    await this.prisma.$transaction(async (tx) => {
      await tx.journalEntry.create({
        data: {
          journalId: bankJournal.id,
          date: now,
          ref: `BANK-${dealId.slice(-8).toUpperCase()}`,
          status: 'POSTED',
          lines: { create: lines },
        },
      });
      // Auto-mark commissions PAYABLE on bank disbursement
      await tx.dealCommission.updateMany({
        where: { dealId, status: 'ACCRUED' },
        data: { status: 'PAYABLE', payableAt: now },
      });
    });
  }

  // -- Commission Accrual --

  async accrueCommission(
    dealCommissionId: string,
    userId: string,
    tx?: any,
    companyId?: string,
    journalId?: string,
    accounts?: Record<string, string>,
    analyticAccountId?: string,
  ): Promise<void> {
    const db = tx ?? this.prisma;
    const now = new Date();

    if (!accounts || !journalId) {
      const commission = await this.prisma.dealCommission.findUniqueOrThrow({
        where: { id: dealCommissionId },
        include: {
          deal: {
            include: {
              location: { include: { journals: true, analyticAccount: true } },
            },
          },
        },
      });
      const generalJournal = commission.deal.location.journals.find(
        (j) => j.type === 'GENERAL',
      );
      if (!generalJournal)
        throw new BadRequestException('No GENERAL journal on location');
      companyId = generalJournal.companyId;
      journalId = generalJournal.id;
      accounts = await this.resolveAccounts(companyId, ['6100', '2400']);
      analyticAccountId = commission.deal.location.analyticAccount?.id;
    }

    const commission = await this.prisma.dealCommission.findUniqueOrThrow({
      where: { id: dealCommissionId },
    });
    // F-19: Idempotency guard — skip if already accrued
    if (commission.accrualJournalEntryId) return;
    const amount = Number(commission.calculatedAmount);

    const commLines = [
      {
        accountId: accounts['6100'],
        debit: amount,
        credit: 0,
        label: 'Sales Commission Expense',
        analyticAccountId,
      },
      {
        accountId: accounts['2400'],
        debit: 0,
        credit: amount,
        label: 'Commissions Payable',
        analyticAccountId,
      },
    ];

    this.assertBalanced(commLines);
    const entry = await db.journalEntry.create({
      data: {
        journalId,
        date: now,
        ref: `COMM-${dealCommissionId.slice(-8).toUpperCase()}`,
        status: 'POSTED',
        lines: {
          create: commLines,
        },
      },
    });

    await db.dealCommission.update({
      where: { id: dealCommissionId },
      data: { accrualJournalEntryId: entry.id, accruedAt: now },
    });
  }

  // -- Commission Payout --

  async payCommission(
    commissionIds: string[],
    journalId: string,
    userId: string,
  ): Promise<void> {
    if (!commissionIds.length)
      throw new BadRequestException('No commission IDs provided');

    const journal = await this.prisma.journal.findUniqueOrThrow({
      where: { id: journalId },
      include: { location: { include: { analyticAccount: true } } },
    });
    const companyId = journal.companyId;
    const now = new Date();
    await this.assertFiscalPeriodOpen(now, companyId);

    const commissions = await this.prisma.dealCommission.findMany({
      where: { id: { in: commissionIds }, status: 'PAYABLE' },
    });
    if (!commissions.length)
      throw new BadRequestException('No PAYABLE commissions found');

    // F-12: Use journal's default credit account instead of hardcoded '1200'
    const bankCreditAccountId = journal.defaultCreditAccountId;
    if (!bankCreditAccountId)
      throw new BadRequestException('Journal has no default credit account — configure it first');
    const accounts = await this.resolveAccounts(companyId, ['2400']);
    const totalPayout = commissions.reduce(
      (s, c) => s + Number(c.calculatedAmount),
      0,
    );
    const analyticAccountId = journal.location?.analyticAccount?.id;

    const payoutLines = [
      {
        accountId: accounts['2400'],
        debit: totalPayout,
        credit: 0,
        label: 'Commissions Payable',
        analyticAccountId,
      },
      {
        accountId: bankCreditAccountId,
        debit: 0,
        credit: totalPayout,
        label: 'Bank - Commission Payout',
        analyticAccountId,
      },
    ];

    this.assertBalanced(payoutLines);
    await this.prisma.$transaction(async (tx) => {
      const entry = await tx.journalEntry.create({
        data: {
          journalId,
          date: now,
          ref: `COMPAY-${Date.now()}`,
          status: 'POSTED',
          lines: {
            create: payoutLines,
          },
        },
      });

      for (const c of commissions) {
        await tx.dealCommission.update({
          where: { id: c.id },
          data: { status: 'PAID', paidAt: now, payoutJournalEntryId: entry.id },
        });
      }
    });
  }

  // -- Commission Clawback --

  async clawbackCommissions(
    dealId: string,
    userId: string,
    tx?: any,
  ): Promise<void> {
    const db = tx ?? this.prisma;

    const commissions = await db.dealCommission.findMany({
      where: { dealId, status: { in: ['ACCRUED', 'PAYABLE'] } },
      include: {
        deal: {
          include: {
            location: { include: { journals: true, analyticAccount: true } },
          },
        },
      },
    });
    if (!commissions.length) return;

    // Resolve journal + accounts once for all commissions on this deal
    const location = commissions[0].deal.location;
    const generalJournal = location.journals.find(
      (j: { type: string }) => j.type === 'GENERAL',
    );
    if (!generalJournal)
      throw new BadRequestException('No GENERAL journal on location');

    const companyId = generalJournal.companyId;
    const accounts = await this.resolveAccounts(companyId, ['2400', '6100']);
    const analyticAccountId = location.analyticAccount?.id;
    const now = new Date();

    for (const commission of commissions) {
      const amount = Number(commission.calculatedAmount);

      // DR Commissions Payable (2400), CR Sales Commission Expense (6100)
      const clawbackLines = [
        {
          accountId: accounts['2400'],
          debit: amount,
          credit: 0,
          label: 'Commission Clawback - Payable Reversal',
          analyticAccountId,
        },
        {
          accountId: accounts['6100'],
          debit: 0,
          credit: amount,
          label: 'Commission Clawback - Expense Reversal',
          analyticAccountId,
        },
      ];
      this.assertBalanced(clawbackLines);
      await db.journalEntry.create({
        data: {
          journalId: generalJournal.id,
          date: now,
          ref: `COMM-CLB-${dealId.slice(-8).toUpperCase()}`,
          status: 'POSTED',
          lines: {
            create: clawbackLines,
          },
        },
      });

      await db.dealCommission.update({
        where: { id: commission.id },
        data: { status: 'CANCELLED' },
      });
    }
  }

  // -- Invoice / Payment GL Posting --

  async postInvoice(invoiceId: string): Promise<void> {
    const inv = await this.prisma.invoice.findUniqueOrThrow({
      where: { id: invoiceId },
      include: { journal: true, lines: { include: { tax: true } } },
    });
    if (inv.status !== 'DRAFT')
      throw new BadRequestException('Invoice not in DRAFT state');

    await this.assertFiscalPeriodOpen(inv.date, inv.journal.companyId);

    let taxAmount = 0;
    for (const line of inv.lines) {
      if (line.tax)
        taxAmount += Number(line.subtotal) * (Number(line.tax.amount) / 100);
    }
    const total = Number(inv.amountUntaxed) + taxAmount;

    const isCustomer =
      inv.type === 'CUSTOMER_INVOICE' || inv.type === 'CUSTOMER_CREDIT_NOTE';
    const isVendorBill =
      inv.type === 'VENDOR_BILL' || inv.type === 'VENDOR_CREDIT_NOTE';
    const prefix = isCustomer ? 'INV' : 'BILL';

    let glLines: any[];
    if (isCustomer) {
      const accounts = await this.resolveAccounts(inv.journal.companyId, [
        '1300',
        '2200',
      ]);
      glLines = [
        {
          accountId: accounts['1300'],
          debit: total,
          credit: 0,
          partnerId: inv.partnerId,
          label: `AR - ${prefix}-${invoiceId.slice(-8).toUpperCase()}`,
        },
        ...inv.lines.map((l) => ({
          accountId: l.accountId,
          debit: 0,
          credit: Number(l.subtotal),
          label: l.description,
        })),
        ...(taxAmount > 0
          ? [
              {
                accountId: accounts['2200'],
                debit: 0,
                credit: taxAmount,
                label: 'VAT 14%',
              },
            ]
          : []),
      ];
    } else {
      // FIX C9: vendor bill tax → Input VAT Receivable (1350), not expense account
      const accountCodes = taxAmount > 0 ? ['2100', '1350'] : ['2100'];
      const accounts = await this.resolveAccounts(
        inv.journal.companyId,
        accountCodes,
      );
      glLines = [
        ...inv.lines.map((l) => ({
          accountId: l.accountId,
          debit: Number(l.subtotal),
          credit: 0,
          label: l.description,
        })),
        ...(taxAmount > 0
          ? [
              {
                accountId: accounts['1350'],
                debit: taxAmount,
                credit: 0,
                label: 'Input VAT Receivable',
              },
            ]
          : []),
        {
          accountId: accounts['2100'],
          debit: 0,
          credit: total,
          partnerId: inv.partnerId,
          label: `AP - ${prefix}-${invoiceId.slice(-8).toUpperCase()}`,
        },
      ];
    }

    this.assertBalanced(glLines);
    await this.prisma.$transaction(async (tx) => {
      await tx.journalEntry.create({
        data: {
          journalId: inv.journalId,
          date: inv.date,
          ref: `${prefix}-${invoiceId.slice(-8).toUpperCase()}`,
          status: 'POSTED',
          invoiceId,
          lines: { create: glLines },
        },
      });
      await tx.invoice.update({
        where: { id: invoiceId },
        data: {
          status: 'POSTED',
          amountTax: taxAmount,
          amountTotal: total,
          amountResidual: total,
        },
      });
    });
  }

  async reverseInvoice(invoiceId: string): Promise<void> {
    const inv = await this.prisma.invoice.findUniqueOrThrow({
      where: { id: invoiceId },
      include: { journalEntry: { include: { lines: true } }, journal: true },
    });
    if (!inv.journalEntry) throw new BadRequestException('No journal entry found for this invoice');
    const now = new Date();
    await this.assertFiscalPeriodOpen(now, inv.journal.companyId);
    const reversalLines = inv.journalEntry!.lines.map((l) => ({
      accountId: l.accountId,
      debit: Number(l.credit),
      credit: Number(l.debit),
      partnerId: l.partnerId ?? undefined,
      label: `Reversal: ${l.label ?? ''}`,
    }));
    this.assertBalanced(reversalLines);
    await this.prisma.$transaction(async (tx) => {
      // ponytail: reversal = mirror lines (swap debit/credit)
      await tx.journalEntry.create({
        data: {
          journalId: inv.journalId,
          date: now,
          ref: `REV-${invoiceId.slice(-8).toUpperCase()}`,
          status: 'POSTED',
          lines: {
            create: reversalLines,
          },
        },
      });
      await tx.invoice.update({ where: { id: invoiceId }, data: { status: 'CANCELLED' } });
    });
  }

  async postPayment(paymentId: string): Promise<void> {
    const p = await this.prisma.payment.findUniqueOrThrow({
      where: { id: paymentId },
      include: { journal: true },
    });
    if (p.status !== 'DRAFT')
      throw new BadRequestException('Payment not in DRAFT state');

    await this.assertFiscalPeriodOpen(p.date, p.journal.companyId);

    const isInbound =
      p.type === 'CUSTOMER_PAYMENT' || p.type === 'CUSTOMER_DEPOSIT';
    let glLines: any[];

    if (p.type === 'CUSTOMER_DEPOSIT') {
      // FIX C8: deposit → DR Bank/Cash / CR Customer Deposits liability (2300)
      // AR doesn't exist yet when deposit is taken. Reclassification to AR happens later.
      const accounts = await this.resolveAccounts(p.journal.companyId, [
        '2300',
      ]);
      const bankAccountId = p.journal.defaultDebitAccountId;
      if (!bankAccountId)
        throw new BadRequestException(
          'Journal has no default debit account — configure it first',
        );
      glLines = [
        {
          accountId: bankAccountId,
          debit: Number(p.amount),
          credit: 0,
          label: p.memo ?? `Deposit ${paymentId.slice(-8)}`,
        },
        {
          accountId: accounts['2300'],
          debit: 0,
          credit: Number(p.amount),
          partnerId: p.partnerId ?? undefined,
          label: 'Customer Deposit',
        },
      ];
    } else if (p.type === 'CUSTOMER_PAYMENT') {
      const accounts = await this.resolveAccounts(p.journal.companyId, [
        '1300',
      ]);
      const bankAccountId = p.journal.defaultDebitAccountId;
      if (!bankAccountId)
        throw new BadRequestException(
          'Journal has no default debit account — configure it first',
        );
      glLines = [
        {
          accountId: bankAccountId,
          debit: Number(p.amount),
          credit: 0,
          label: p.memo ?? `Payment ${paymentId.slice(-8)}`,
        },
        {
          accountId: accounts['1300'],
          debit: 0,
          credit: Number(p.amount),
          partnerId: p.partnerId ?? undefined,
          label: 'Clear AR',
        },
      ];
    } else {
      // ponytail: vendor payment — if WHT present, split into AP / Bank / WHT Payable
      const whtAmt = Number(p.whtAmount ?? 0);
      const disbursement = Number(p.amount) - whtAmt;
      const accountCodes = whtAmt > 0 ? ['2100', '2120'] : ['2100'];
      const accounts = await this.resolveAccounts(p.journal.companyId, accountCodes);
      const bankAccountId = p.journal.defaultCreditAccountId;
      if (!bankAccountId)
        throw new BadRequestException(
          'Journal has no default credit account — configure it first',
        );
      glLines = [
        {
          accountId: accounts['2100'],
          debit: Number(p.amount),
          credit: 0,
          partnerId: p.partnerId ?? undefined,
          label: 'Clear AP',
        },
        {
          accountId: bankAccountId,
          debit: 0,
          credit: disbursement,
          label: p.memo ?? `Payment ${paymentId.slice(-8)}`,
        },
        ...(whtAmt > 0
          ? [
              {
                accountId: accounts['2120'],
                debit: 0,
                credit: whtAmt,
                label: 'WHT Payable',
              },
            ]
          : []),
      ];
    }

    this.assertBalanced(glLines);
    await this.prisma.$transaction(async (tx) => {
      await tx.journalEntry.create({
        data: {
          journalId: p.journalId,
          date: p.date,
          ref: `PAY-${paymentId.slice(-8).toUpperCase()}`,
          status: 'POSTED',
          paymentId,
          lines: { create: glLines },
        },
      });
      await tx.payment.update({
        where: { id: paymentId },
        data: { status: 'POSTED' },
      });
      // ponytail: CASH deal → mark commissions PAYABLE on first customer payment posted
      if (p.dealId && p.type === 'CUSTOMER_PAYMENT') {
        const deal = await tx.deal.findUnique({
          where: { id: p.dealId },
          select: { purchaseMethod: true },
        });
        if (deal?.purchaseMethod === 'CASH') {
          await tx.dealCommission.updateMany({
            where: { dealId: p.dealId, status: 'ACCRUED' },
            data: { status: 'PAYABLE', payableAt: new Date() },
          });
        }
      }
    });
  }

  // -- Private Helpers --

  async assertFiscalPeriodOpen(date: Date, companyId: string, userId?: string) {
    const fiscal = await this.prisma.fiscalYear.findFirst({
      where: { companyId, startDate: { lte: date }, endDate: { gte: date } },
    });
    if (!fiscal)
      throw new BadRequestException(
        'No open fiscal year for the posting date.',
      );
    if (fiscal.lockDate && date <= fiscal.lockDate) {
      if (userId) {
        const override = await this.prisma.userPermission.findFirst({
          where: {
            userId,
            permissionKey: 'finance:lock-override',
            granted: true,
          },
        });
        if (override) {
          await this.prisma.auditLog.create({
            data: {
              entityType: 'FiscalYear',
              entityId: fiscal.id,
              action: 'LOCK_OVERRIDE',
              userId,
            },
          });
          return; // allowed
        }
      }
      throw new BadRequestException(
        'Fiscal period is locked. Finance Admin — Lock Override permission required.',
      );
    }
  }

  private async resolveAccounts(
    companyId: string,
    codes: string[],
  ): Promise<Record<string, string>> {
    const rows = await this.prisma.account.findMany({
      where: { companyId, code: { in: codes } },
      select: { id: true, code: true },
    });
    const map: Record<string, string> = {};
    for (const r of rows) map[r.code] = r.id;
    const missing = codes.filter((c) => !map[c]);
    if (missing.length) {
      throw new BadRequestException(
        `GL accounts not found in COA: ${missing.join(', ')}. Run prisma:seed first.`,
      );
    }
    return map;
  }
}
