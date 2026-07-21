import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuditService } from '../../audit/audit.service';
import { FiscalPeriodService } from '../fiscal-periods/fiscal-period.service';
import Decimal from 'decimal.js';
import { generateInvoiceNumber } from '../../common/helpers/invoice-numbering.helper';

/**
 * All GL postings go through this service -- never create JournalEntry rows
 * directly from other modules. Enforces audit + fiscal-period validation.
 */
@Injectable()
export class PostingService {
  private readonly logger = new Logger(PostingService.name);

  constructor(
    private prisma: PrismaService,
    private auditService: AuditService,
    private fiscalPeriodService: FiscalPeriodService,
  ) {}

  // ponytail: L-2 — VAT rate from DB, fallback to 14% if seed missing
  private async getVatRate(companyId: string): Promise<number> {
    const tax = await this.prisma.tax.findFirst({
      where: { name: 'Egypt VAT 14%', scope: 'SALE' },
      select: { amount: true },
    });
    return tax ? Number(tax.amount) / 100 : 0.14;
  }

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
      throw new BadRequestException(
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

    if (deal.status === 'FINALIZED') {
      throw new BadRequestException(`Deal ${dealId} is already finalized`);
    }

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
    await this.fiscalPeriodService.assertOpen(now, companyId);

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
    const vatRate = await this.getVatRate(companyId);
    const vatAmount = Math.round(salePrice * vatRate * 100) / 100;
    const totalAR = salePrice + vatAmount + adminFee + insuranceFee;

    const analyticAccountId = deal.location.analyticAccount?.id;

    // M-14: mutable ref for trade-in vehicle ID (updated inside tx if auto-created)
    let resolvedTradeInVehicleId = deal.tradeInVehicleId;

    // Generate invoice number before entering transaction (same pattern as InvoicesService.create)
    const invoiceNumber = await generateInvoiceNumber(this.prisma, companyId);

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

      // ponytail: sale GL posted after invoice.id known — see step 3a below

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
      let partnerId = deal.customer.partnerId;
      if (!partnerId) {
        // ponytail: auto-create Partner from User data so finalization never blocks on admin setup
        const created = await tx.partner.create({
          data: {
            type: 'CUSTOMER',
            name: deal.customer.name,
            email: deal.customer.email ?? undefined,
            phone: deal.customer.phone ?? undefined,
            user: { connect: { id: deal.customer.id } },
          },
        });
        partnerId = created.id;
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
          number: invoiceNumber,
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

      // 3a. Sale GL entry — created after invoice so invoiceId can be set (required for reversal)
      // DR: AR 1300 / CR: Vehicle Sales Income 4100 + VAT Payable 2200 + Admin Fee 4210 + Insurance 4220
      this.assertBalanced(saleLines);
      await tx.journalEntry.create({
        data: {
          journalId: saleJournal.id,
          date: now,
          ref: `SALE-${dealId.slice(-8).toUpperCase()}`,
          status: 'POSTED',
          invoiceId: invoice.id,
          lines: {
            create: saleLines,
          },
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
        // Patch mutable ref so the 4b block picks it up
        resolvedTradeInVehicleId = tradeInVehicle.id;
      }

      // 4b. Trade-in vehicle GL entry -- DR Used Vehicle Inventory (1410), CR AR (1300)
      const tradeInValue = Number(deal.tradeInValue ?? 0);
      if (tradeInValue > 0 && resolvedTradeInVehicleId) {
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
          where: { id: resolvedTradeInVehicleId! },
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
          tx,
          companyId,
          generalJournal.id,
          accounts,
          analyticAccountId,
        );
      }
    });

    this.logger.log(
      `finalizeDeal: dealId=${dealId} totalAR=${totalAR} method=${deal.purchaseMethod ?? 'CASH'} vehicleCost=${vehicleCost}`,
    );
    // ponytail: fire-and-forget audit — no await needed, non-critical path
    this.auditService.log({
      userId,
      action: 'FINALIZE_DEAL',
      entityType: 'Deal',
      entityId: dealId,
      changes: {
        salePrice,
        adminFee,
        insuranceFee,
        vatAmount,
        totalAR,
        vehicleCost,
        purchaseMethod: deal.purchaseMethod ?? 'CASH',
      },
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
                customer: { select: { id: true, name: true, phone: true, email: true, partnerId: true } },
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
    await this.fiscalPeriodService.assertOpen(now, companyId);

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

      // ponytail: auto-create Partner from customer User if missing so Payment can be linked
      const customer = deal.customer;
      let partnerId = customer?.partnerId ?? null;
      if (customer && !partnerId) {
        const created = await tx.partner.create({
          data: {
            type: 'CUSTOMER',
            name: customer.name,
            email: customer.email ?? undefined,
            phone: customer.phone ?? undefined,
            user: { connect: { id: customer.id } },
          },
        });
        partnerId = created.id;
      }

      // Create a Payment record so the collection appears in Finance → Payments and can produce a receipt
      let paymentId: string | null = null;
      if (partnerId) {
        const recNum = `REC-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}-${installmentLineId.slice(-6).toUpperCase()}`;
        const payment = await tx.payment.create({
          data: {
            number: recNum,
            type: 'CUSTOMER_PAYMENT',
            status: 'POSTED',
            partnerId,
            journalId: cashJournal.id,
            date: now,
            amount: totalDue,
            method: 'CASH',
            memo: `قسط رقم ${line.installmentNumber} — Installment No. ${line.installmentNumber}`,
            dealId: deal.id,
          },
        });
        paymentId = payment.id;
      }

      await tx.installmentLine.update({
        where: { id: installmentLineId },
        data: {
          status: 'PAID',
          paidAmount: Number(line.totalDue),
          paidDate: now,
          ...(paymentId && { paymentId }),
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

    this.logger.log(
      `postInstallment: lineId=${installmentLineId} total=${totalDue} principal=${principal} interest=${interest} dueDate=${line.dueDate?.toISOString() ?? 'n/a'}`,
    );
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
    await this.fiscalPeriodService.assertOpen(now, companyId);

    // F-12: Use journal's default debit account instead of hardcoded '1200'
    const bankDebitAccountId = bankJournal.defaultDebitAccountId;
    if (!bankDebitAccountId)
      throw new BadRequestException('BANK journal has no default debit account — configure it first');
    const accounts = await this.resolveAccounts(companyId, ['1300']);
    const analyticAccountId = deal.location.analyticAccount?.id;

    const approvedAmount = Number(bankApproval.approvedAmount);
    const vatRate = await this.getVatRate(companyId);
    const saleTotal =
      Number(deal.salePrice) * (1 + vatRate) +
      Number(deal.adminFee ?? 0) +
      Number(deal.insuranceFee ?? 0);

    // Cap disbursement at saleTotal — overage stays in customer account, not part of deal
    const disbursementAmount = Math.min(approvedAmount, saleTotal);

    // Per spec 06: DR Bank disbursementAmount / CR AR disbursementAmount
    // Shortfall (saleTotal - disbursementAmount) remains as open AR for customer to pay
    const lines = [
      {
        accountId: bankDebitAccountId,
        debit: disbursementAmount,
        credit: 0,
        label: 'Bank disbursement received',
        analyticAccountId,
      },
      {
        accountId: accounts['1300'],
        debit: 0,
        credit: disbursementAmount,
        label: `Clear AR — bank disbursement${disbursementAmount < saleTotal ? ' (partial — shortfall remains on AR)' : ''}`,
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

    this.logger.log(
      `postBankDisbursement: dealId=${dealId} approved=${approvedAmount} disbursed=${disbursementAmount} saleTotal=${saleTotal} shortfall=${saleTotal - disbursementAmount}`,
    );
  }

  // -- Commission Accrual --

  async accrueCommission(
    dealCommissionId: string,
    userId: string,
    tx?: Prisma.TransactionClient,
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

    this.logger.log(
      `accrueCommission: commissionId=${dealCommissionId} amount=${amount} salesRepId=${commission.userId}`,
    );
    this.auditService.log({
      userId,
      action: 'ACCRUE_COMMISSION',
      entityType: 'Commission',
      entityId: dealCommissionId,
      changes: {
        calculatedAmount: amount,
        dealId: commission.dealId,
        salesRepId: commission.userId,
      },
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
    await this.fiscalPeriodService.assertOpen(now, companyId);

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

    this.logger.log(
      `payCommission: ids=[${commissionIds.join(',')}] total=${totalPayout} count=${commissions.length}`,
    );
  }

  // -- Commission Clawback --

  async clawbackCommissions(
    dealId: string,
    userId: string,
    tx?: Prisma.TransactionClient,
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

    // C2/C3 fix: deal invoices already have POSTED GL from finalizeDeal — only flip status.
    // C3: amountResidual was set to (totalAR - tradeInValue) by finalizeDeal; don't overwrite it.
    if (inv.dealId) {
      await this.prisma.invoice.update({
        where: { id: invoiceId },
        data: { status: 'POSTED' },
      });
      return;
    }

    await this.fiscalPeriodService.assertOpen(inv.date, inv.journal.companyId);

    let taxAmount = 0;
    for (const line of inv.lines) {
      if (line.tax)
        taxAmount += Number(line.subtotal) * (Number(line.tax.amount) / 100);
    }
    const total = Number(inv.amountUntaxed) + taxAmount;

    const isCustomer =
      inv.type === 'CUSTOMER_INVOICE' || inv.type === 'CUSTOMER_CREDIT_NOTE';
    const prefix = isCustomer ? 'INV' : 'BILL';

    interface GlLine { accountId: string; debit: number; credit: number; label: string; partnerId?: string }
    let glLines: GlLine[];
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
    await this.fiscalPeriodService.assertOpen(now, inv.journal.companyId);
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

    await this.fiscalPeriodService.assertOpen(p.date, p.journal.companyId);

    let glLines: Array<{ accountId: string; debit: number; credit: number; label: string; partnerId?: string }>;

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

  // -- AP Payment Run --

  async postApPaymentRun(
    invoiceId: string,
    payJournalId: string,
    paymentDate: Date,
    userId: string,
  ): Promise<void> {
    const inv = await this.prisma.invoice.findUniqueOrThrow({
      where: { id: invoiceId },
      include: { journal: true },
    });

    const journal = await this.prisma.journal.findUniqueOrThrow({
      where: { id: payJournalId },
    });

    const companyId = journal.companyId;
    await this.fiscalPeriodService.assertOpen(paymentDate, companyId);

    const bankAccountId = journal.defaultCreditAccountId;
    if (!bankAccountId) {
      throw new BadRequestException(
        `Journal ${payJournalId} has no default credit account — configure it first`,
      );
    }

    const accounts = await this.resolveAccounts(companyId, ['2100']);
    const amount = Number(inv.amountResidual);

    // DR AP (2100) / CR Bank (journal default credit account)
    const glLines = [
      {
        accountId: accounts['2100'],
        debit: amount,
        credit: 0,
        partnerId: inv.partnerId ?? undefined,
        label: 'AP Payment Run — Clear AP',
      },
      {
        accountId: bankAccountId,
        debit: 0,
        credit: amount,
        label: 'AP Payment Run — Bank',
      },
    ];

    this.assertBalanced(glLines);

    await this.prisma.$transaction(async (tx) => {
      const payment = await tx.payment.create({
        data: {
          type: 'VENDOR_PAYMENT',
          partnerId: inv.partnerId,
          journalId: payJournalId,
          amount,
          date: paymentDate,
          method: 'BANK_TRANSFER',
          status: 'POSTED',
          memo: `AP Payment Run — Invoice ${invoiceId.slice(-8).toUpperCase()}`,
        },
      });

      await tx.paymentAllocation.create({
        data: { paymentId: payment.id, invoiceId, amount },
      });

      await tx.invoice.update({
        where: { id: invoiceId },
        data: { amountResidual: 0, paymentStatus: 'PAID' },
      });

      await tx.journalEntry.create({
        data: {
          journalId: payJournalId,
          date: paymentDate,
          ref: `APRUN-${invoiceId.slice(-8).toUpperCase()}`,
          status: 'POSTED',
          paymentId: payment.id,
          lines: { create: glLines },
        },
      });
    });

    this.logger.log(
      `postApPaymentRun: invoiceId=${invoiceId} amount=${amount} journal=${payJournalId}`,
    );
    this.auditService.log({
      userId,
      action: 'AP_PAYMENT_RUN',
      entityType: 'Invoice',
      entityId: invoiceId,
      changes: { amount, payJournalId, paymentDate },
    });
  }

  // -- Private Helpers --

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
