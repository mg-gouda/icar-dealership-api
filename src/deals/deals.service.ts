import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { PostingService } from '../finance/posting/posting.service';
import { MailService } from '../common/mail/mail.service';
import { CommissionConfigService } from '../commission-config/commission-config.service';

@Injectable()
export class DealsService {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
    private posting: PostingService,
    private mail: MailService,
    private commissionConfig: CommissionConfigService,
  ) {}

  // ponytail: structured installment statement for a deal
  async getStatement(dealId: string) {
    const deal = await this.prisma.deal.findUniqueOrThrow({
      where: { id: dealId },
      include: {
        vehicle: { select: { make: true, model: true, year: true } },
        customer: { select: { name: true, phone: true, email: true } },
        installmentPlan: {
          include: {
            installments: {
              orderBy: { dueDate: 'asc' },
              include: {
                payment: {
                  select: { id: true },
                },
              },
            },
          },
        },
      },
    });

    if (!deal.installmentPlan) {
      throw new BadRequestException(
        'Deal has no installment plan — statement only available for DEALERSHIP_INSTALLMENT deals',
      );
    }

    const plan = deal.installmentPlan;
    const v = deal.vehicle;
    const now = new Date();

    const installments = plan.installments.map((line) => ({
      id: line.id,
      dueDate: line.dueDate,
      amount: Number(line.totalDue),
      status: line.status,
      paidAt: line.paidDate,
      collectedBy: null as string | null, // no collector FK on InstallmentLine
    }));

    const totalPaid = plan.installments
      .filter((l) => l.status === 'PAID')
      .reduce((s, l) => s + Number(l.paidAmount), 0);

    const totalOutstanding = plan.installments
      .filter((l) => l.status !== 'PAID')
      .reduce((s, l) => s + Number(l.totalDue) - Number(l.paidAmount), 0);

    const overdueLines = plan.installments.filter(
      (l) => l.status === 'OVERDUE' || (l.status === 'PENDING' && l.dueDate < now),
    );

    const nextDueLine = plan.installments.find(
      (l) => l.status === 'PENDING' || l.status === 'PARTIAL',
    );

    return {
      deal: {
        id: deal.id,
        vehicleDesc: v ? `${v.year} ${v.make} ${v.model}` : '',
        salePrice: Number(deal.salePrice),
        purchaseMethod: deal.purchaseMethod,
      },
      customer: {
        name: deal.customer.name,
        phone: deal.customer.phone,
        email: deal.customer.email,
      },
      installmentPlan: {
        totalAmount: Number(plan.totalPayable),
        monthlyAmount: plan.monthlyInstallment ? Number(plan.monthlyInstallment) : null,
        durationMonths: plan.durationMonths,
        interestRate: Number(plan.interestRate),
        startDate: plan.startDate,
        installments,
      },
      summary: {
        totalPaid,
        totalOutstanding,
        nextDueDate: nextDueLine?.dueDate ?? null,
        nextDueAmount: nextDueLine ? Number(nextDueLine.totalDue) : null,
        overdueCount: overdueLines.length,
        overdueAmount: overdueLines.reduce(
          (s, l) => s + Number(l.totalDue) - Number(l.paidAmount),
          0,
        ),
      },
    };
  }

  async findAll(query: {
    locationId?: string;
    status?: string;
    purchaseMethod?: string;
    salesRepId?: string;
    page?: number;
    limit?: number;
  }) {
    const {
      locationId,
      status,
      purchaseMethod,
      salesRepId,
    } = query;
    // ponytail: clamp pagination to prevent negative skip / DoS via huge limit
    const page = Math.max(1, +(query.page ?? 1) || 1);
    const limit = Math.min(100, Math.max(1, +(query.limit ?? 20) || 20));
    const where = {
      ...(locationId && { locationId }),
      ...(status && { status: status as any }),
      ...(purchaseMethod && { purchaseMethod: purchaseMethod as any }),
      ...(salesRepId && { salesRepId }),
    };
    const [data, total] = await this.prisma.$transaction([
      this.prisma.deal.findMany({
        where,
        include: {
          vehicle: { select: { id: true, make: true, model: true, year: true, price: true } },
          customer: { select: { id: true, name: true, phone: true, email: true } },
          salesRep: { select: { id: true, name: true } },
          location: { select: { id: true, name: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (Number(page) - 1) * Number(limit),
        take: Number(limit),
      }),
      this.prisma.deal.count({ where }),
    ]);
    return { data, total, page: Number(page), limit: Number(limit) };
  }

  async findById(id: string) {
    const deal = await this.prisma.deal.findUnique({
      where: { id },
      include: {
        vehicle: true,
        customer: true,
        salesRep: { select: { id: true, name: true } },
        location: true,
        installmentPlan: {
          include: {
            installments: {
              orderBy: { dueDate: 'asc' },
              include: { payment: { select: { id: true } } },
            },
          },
        },
        financeApplication: {
          include: { requiredDocuments: true, bankApproval: true },
        },
        commissions: {
          include: { user: { select: { id: true, name: true } } },
        },
        invoices: {
          select: { id: true, status: true, amountTotal: true, dueDate: true },
        },
      },
    });
    if (!deal) throw new NotFoundException(`Deal ${id} not found`);
    return deal;
  }

  async create(
    data: {
      locationId: string;
      vehicleId: string;
      customerId: string;
      salesRepId: string;
      purchaseMethod: string;
      salePrice: number;
      adminFee?: number;
      insuranceFee?: number;
      leadId?: string;
      tradeInMake?: string;
      tradeInModel?: string;
      tradeInYear?: number;
      tradeInValue?: number;
    },
    userId: string,
  ) {
    // vehicle must be AVAILABLE
    const vehicle = await this.prisma.vehicle.findUniqueOrThrow({
      where: { id: data.vehicleId },
    });
    if (vehicle.status !== 'AVAILABLE') {
      throw new BadRequestException(
        `Vehicle ${data.vehicleId} is not available (status: ${vehicle.status})`,
      );
    }

    // Fee cascade: explicit value → vehicle override → location default
    const location = await this.prisma.location.findUniqueOrThrow({
      where: { id: data.locationId },
    });
    const adminFee =
      data.adminFee ??
      Number(vehicle.adminFeeOverride ?? location.defaultAdminFee ?? 0);
    const insuranceFee =
      data.insuranceFee ??
      Number(vehicle.insuranceFeeOverride ?? location.defaultInsuranceFee ?? 0);

    const deal = await this.prisma.$transaction(async (tx) => {
      const d = await tx.deal.create({
        data: {
          locationId: data.locationId,
          vehicleId: data.vehicleId,
          customerId: data.customerId,
          salesRepId: data.salesRepId,
          leadId: data.leadId,
          salePrice: data.salePrice,
          adminFee,
          insuranceFee,
          purchaseMethod: data.purchaseMethod as any,
          status: 'DRAFT',
          tradeInMake: data.tradeInMake,
          tradeInModel: data.tradeInModel,
          tradeInYear: data.tradeInYear,
          tradeInValue: data.tradeInValue,
        },
      });
      // mark vehicle RESERVED while deal is open
      await tx.vehicle.update({
        where: { id: data.vehicleId },
        data: { status: 'RESERVED' },
      });
      return d;
    });

    await this.audit.log({
      entity: 'Deal',
      entityId: deal.id,
      action: 'CREATE',
      userId,
      newValue: deal,
    });
    return deal;
  }

  async update(
    id: string,
    data: Partial<{
      salePrice: number;
      adminFee: number;
      insuranceFee: number;
      salesRepId: string;
      purchaseMethod: string;
      tradeInMake: string;
      tradeInModel: string;
      tradeInYear: number;
      tradeInValue: number;
    }>,
    userId: string,
  ) {
    const deal = await this.prisma.deal.findUniqueOrThrow({ where: { id } });

    // ponytail: userId is passed; look up the user's role for bounds check + privilege override
    const actor = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { role: true },
    });
    const privileged = ['FINANCE', 'ADMIN', 'SUPER_ADMIN'].includes(actor.role);

    // B-12: Allow FINANCE/ADMIN/SUPER_ADMIN to edit finalized deals (with audit)
    if (deal.status === 'FINALIZED') {
      if (!privileged)
        throw new BadRequestException('Cannot edit a finalized deal');
      await this.audit.log({
        entity: 'Deal',
        entityId: id,
        action: 'EDIT_FINALIZED',
        userId,
        newValue: data,
      });
    }
    // B-13: Allow FINANCE/ADMIN/SUPER_ADMIN to change purchaseMethod after DRAFT (with audit)
    if (
      deal.status !== 'DRAFT' &&
      data.purchaseMethod &&
      data.purchaseMethod !== deal.purchaseMethod
    ) {
      if (!privileged)
        throw new BadRequestException(
          'Purchase method cannot be changed after deal leaves DRAFT status',
        );
      await this.audit.log({
        entity: 'Deal',
        entityId: id,
        action: 'CHANGE_PURCHASE_METHOD',
        userId,
        newValue: { from: deal.purchaseMethod, to: data.purchaseMethod },
      });
    }
    await this.assertFeeBounds(
      deal.locationId,
      actor.role,
      data.adminFee,
      data.insuranceFee,
    );

    const updated = await this.prisma.deal.update({
      where: { id },
      data: data as any,
    });
    await this.audit.log({
      entity: 'Deal',
      entityId: id,
      action: 'UPDATE',
      userId,
      newValue: data,
    });
    return updated;
  }

  async finalize(id: string, userId: string) {
    const deal = await this.prisma.deal.findUniqueOrThrow({
      where: { id },
      include: {
        vehicle: true,
        location: true,
        financeApplication: { include: { bankApproval: true } },
      },
    });
    if (deal.status !== 'DRAFT' && deal.status !== 'PENDING_FINANCE') {
      throw new BadRequestException(
        `Deal ${id} is not in a finalizable state (status: ${deal.status})`,
      );
    }
    if (deal.purchaseMethod === 'BANK_FINANCING') {
      if (
        deal.financeApplication?.bankFinancingStatus !== 'APPROVED' ||
        !deal.financeApplication?.bankApproval
      ) {
        throw new BadRequestException(
          'Bank financing deals require an approved bank approval before finalizing.',
        );
      }
    }

    // ponytail: posting.finalizeDeal is already atomic — outer $transaction was a no-op
    await this.posting.finalizeDeal(id, userId);

    await this.audit.log({
      entity: 'Deal',
      entityId: id,
      action: 'FINALIZE',
      userId,
    });

    // Email customer about finalized deal (fire-and-forget)
    const finalized = await this.findById(id);
    const cust = (finalized as any).customer;
    if (cust?.email) {
      const v = (finalized as any).vehicle;
      const vehicleDesc = v ? `${v.year} ${v.make} ${v.model}` : 'vehicle';
      this.mail
        .sendDealStatusUpdate(cust.email, cust.name, 'FINALIZED', vehicleDesc)
        .catch(() => undefined);
    }

    return finalized;
  }

  async cancel(id: string, userId: string) {
    const deal = await this.prisma.deal.findUniqueOrThrow({ where: { id } });
    if (deal.status === 'FINALIZED')
      throw new ForbiddenException('Cannot cancel a finalized deal');

    await this.prisma.$transaction(async (tx) => {
      await tx.deal.update({ where: { id }, data: { status: 'CANCELLED' } });
      // release vehicle back to AVAILABLE
      await tx.vehicle.update({
        where: { id: deal.vehicleId },
        data: { status: 'AVAILABLE' },
      });

      // ponytail: commission clawback -- reverse any ACCRUED/PAYABLE commissions
      await this.posting.clawbackCommissions(id, userId, tx);
    });

    await this.audit.log({
      entity: 'Deal',
      entityId: id,
      action: 'CANCEL',
      userId,
    });
    return this.findById(id);
  }

  async addInstallmentPlan(
    dealId: string,
    data: {
      principalAmount: number;
      downPayment: number;
      interestRate: number;
      durationMonths: number;
      calculationMethod: string;
      totalPayable: number;
      monthlyInstallment?: number;
      firstInstallmentDate?: Date | string;
      startDate?: Date | string;
    },
    userId: string,
  ) {
    const deal = await this.prisma.deal.findUniqueOrThrow({
      where: { id: dealId },
    });
    if (deal.purchaseMethod !== 'DEALERSHIP_INSTALLMENT') {
      throw new BadRequestException(
        'Deal purchase method is not DEALERSHIP_INSTALLMENT',
      );
    }

    // Generate installment lines
    const lines: Array<{
      installmentNumber: number;
      dueDate: Date;
      principalPortion: number;
      interestPortion: number;
      totalDue: number;
      status: 'PENDING';
      paidAmount: number;
    }> = [];

    const principal = data.principalAmount;
    const n = data.durationMonths;
    const annualRate = data.interestRate / 100;

    const fixResidue = (arr: typeof lines, totalPrincipal: number, totalPayable: number) => {
      if (!arr.length) return;
      const sumP = arr.slice(0, -1).reduce((s, l) => s + l.principalPortion, 0);
      const sumI = arr.slice(0, -1).reduce((s, l) => s + l.interestPortion, 0);
      const last = arr[arr.length - 1];
      last.principalPortion = Math.round((totalPrincipal - sumP) * 100) / 100;
      last.interestPortion  = Math.round((totalPayable - totalPrincipal - sumI) * 100) / 100;
      last.totalDue = Math.round((last.principalPortion + last.interestPortion) * 100) / 100;
    };

    if (data.calculationMethod === 'AMORTIZING') {
      // متناقصة — true declining: fixed principal chunk + interest on remaining balance → payment decreases each month
      const r = annualRate / 12;
      const principalChunk = principal / n;
      let balance = principal;
      const baseDate = data.firstInstallmentDate ?? data.startDate;
      for (let i = 0; i < n; i++) {
        const isLast = i === n - 1;
        const principalPortion = isLast
          ? Math.round(balance * 100) / 100
          : Math.round(principalChunk * 100) / 100;
        const interestPortion = Math.round(balance * r * 100) / 100;
        const dueDate = new Date(baseDate as string);
        dueDate.setMonth(dueDate.getMonth() + i);
        lines.push({ installmentNumber: i + 1, dueDate, principalPortion, interestPortion, totalDue: Math.round((principalPortion + interestPortion) * 100) / 100, status: 'PENDING', paidAmount: 0 });
        balance -= principalPortion;
      }
      // no fixResidue — last line absorbs principal residual directly above

    } else if (data.calculationMethod === 'COMPOUND') {
      // مركبة (A) — compound total: P × (1 + annual)^(months/12) ÷ n → flat equal payments
      const totalOwed = principal * Math.pow(1 + annualRate, n / 12);
      const totalInterest = totalOwed - principal;
      const baseDate2 = data.firstInstallmentDate ?? data.startDate;
      for (let i = 0; i < n; i++) {
        const dueDate = new Date(baseDate2 as string);
        dueDate.setMonth(dueDate.getMonth() + i);
        const principalPortion = Math.round((principal / n) * 100) / 100;
        const interestPortion  = Math.round((totalInterest / n) * 100) / 100;
        lines.push({ installmentNumber: i + 1, dueDate, principalPortion, interestPortion, totalDue: Math.round((principalPortion + interestPortion) * 100) / 100, status: 'PENDING', paidAmount: 0 });
      }
      fixResidue(lines, principal, totalOwed);

    } else {
      // ثابتة (FLAT) — simple interest: P × annual × (months/12) spread evenly → flat equal payments
      const totalInterest = principal * annualRate * (n / 12);
      const totalOwed = principal + totalInterest;
      const baseDate3 = data.firstInstallmentDate ?? data.startDate;
      for (let i = 0; i < n; i++) {
        const dueDate = new Date(baseDate3 as string);
        dueDate.setMonth(dueDate.getMonth() + i);
        const principalPortion = Math.round((principal / n) * 100) / 100;
        const interestPortion  = Math.round((totalInterest / n) * 100) / 100;
        lines.push({ installmentNumber: i + 1, dueDate, principalPortion, interestPortion, totalDue: Math.round((principalPortion + interestPortion) * 100) / 100, status: 'PENDING', paidAmount: 0 });
      }
      fixResidue(lines, principal, totalOwed);
    }

    // ponytail: compute totals from generated lines for accuracy
    const computedTotal = lines.reduce((s, l) => s + l.totalDue, 0);
    const computedMonthly =
      data.calculationMethod === 'AMORTIZING'
        ? undefined // varies per line — decreasing
        : (lines[0]?.totalDue ?? 0);

    const plan = await this.prisma.installmentPlan.create({
      data: {
        dealId,
        status: 'ACTIVE',
        principalAmount: data.principalAmount,
        downPayment: data.downPayment,
        interestRate: data.interestRate,
        durationMonths: data.durationMonths,
        calculationMethod: data.calculationMethod as any,
        totalPayable: Math.round(computedTotal * 100) / 100,
        monthlyInstallment: computedMonthly,
        startDate: new Date((data.firstInstallmentDate ?? data.startDate) as string),
        installments: {
          createMany: { data: lines },
        },
      },
      include: { installments: true },
    });
    await this.audit.log({
      entity: 'InstallmentPlan',
      entityId: plan.id,
      action: 'CREATE',
      userId,
      newValue: plan,
    });
    return plan;
  }

  // ── Installment collection ────────────────────────────────────────────────

  async collectInstallment(dealId: string, lineId: string, userId: string) {
    // Verify line belongs to this deal
    const line = await this.prisma.installmentLine.findUniqueOrThrow({
      where: { id: lineId },
      include: { installmentPlan: true },
    });
    if (line.installmentPlan.dealId !== dealId) {
      throw new BadRequestException(
        'Installment line does not belong to this deal',
      );
    }
    if (line.status === 'PAID') {
      throw new BadRequestException('Installment line already paid');
    }
    await this.posting.postInstallment(lineId, userId);
    await this.audit.log({
      entity: 'InstallmentLine',
      entityId: lineId,
      action: 'COLLECT',
      userId,
    });
    return this.findById(dealId);
  }

  async getInstallmentLineReceipt(dealId: string, lineId: string) {
    const line = await this.prisma.installmentLine.findUniqueOrThrow({
      where: { id: lineId },
      include: {
        payment: {
          include: {
            partner: true,
            journal: { include: { company: true, location: true } },
          },
        },
        installmentPlan: {
          include: {
            deal: {
              include: {
                customer: { select: { name: true, phone: true, email: true, partnerId: true } },
                vehicle: { select: { make: true, model: true, year: true, vin: true } },
                location: { include: { company: true, journals: { take: 1, where: { type: { in: ['CASH', 'BANK'] as any } } } } },
              },
            },
          },
        },
      },
    });
    if (line.installmentPlan.dealId !== dealId) {
      throw new BadRequestException('Installment line does not belong to this deal');
    }
    const deal = line.installmentPlan.deal;
    const jeRef = `INST-${lineId.slice(-8).toUpperCase()}`;
    const cashJournal = line.payment?.journal ?? deal.location.journals[0] ?? null;
    const company = cashJournal?.company ?? deal.location.company ?? null;
    const location = cashJournal?.location ?? deal.location ?? null;

    return {
      receiptNumber: line.payment?.number ?? `REC-${(line.paidDate ?? line.dueDate).toISOString().slice(0, 10).replace(/-/g, '')}-${lineId.slice(-6).toUpperCase()}`,
      jeRef,
      date: line.paidDate ?? line.dueDate,
      amount: Number(line.totalDue),
      principalPortion: Number(line.principalPortion),
      interestPortion: Number(line.interestPortion),
      installmentNumber: line.installmentNumber,
      method: 'CASH',
      customer: {
        name: line.payment?.partner?.name ?? deal.customer?.name ?? '',
        phone: deal.customer?.phone ?? null,
        email: deal.customer?.email ?? null,
      },
      vehicle: deal.vehicle ? {
        make: deal.vehicle.make,
        model: deal.vehicle.model,
        year: deal.vehicle.year,
        vin: deal.vehicle.vin ?? null,
      } : null,
      company: company ? {
        name: company.name,
        address: company.address ?? null,
        phone: company.phone ?? null,
        taxId: company.taxId ?? null,
      } : null,
      location: location ? {
        name: (location as any).name ?? null,
        address: (location as any).address ?? null,
        city: (location as any).city ?? null,
        phone: (location as any).phone ?? null,
      } : null,
      paymentId: line.paymentId ?? null,
    };
  }

  async sendInstallmentReminder(dealId: string, lineId: string) {
    const line = await this.prisma.installmentLine.findUniqueOrThrow({
      where: { id: lineId },
      include: {
        installmentPlan: {
          include: {
            deal: {
              include: { customer: { select: { email: true, name: true } } },
            },
          },
        },
      },
    });
    if (line.installmentPlan.dealId !== dealId) {
      throw new BadRequestException(
        'Installment line does not belong to this deal',
      );
    }
    const customer = line.installmentPlan.deal.customer;
    if (customer?.email) {
      this.mail
        .send({
          to: customer.email,
          subject: 'Installment Payment Reminder',
          html: `<p>Dear ${customer.name ?? 'Customer'},</p>
<p>This is a reminder that your installment payment of <strong>${Number(line.totalDue).toLocaleString()} EGP</strong> was due on <strong>${new Date(line.dueDate).toLocaleDateString('en-EG')}</strong>.</p>
<p>Please arrange payment at your earliest convenience.</p>`,
        })
        .catch(() => {
          /* non-critical */
        });
    }
    return { sent: !!customer?.email };
  }

  // ── Bank disbursement ─────────────────────────────────────────────────────

  async postBankDisbursement(dealId: string, userId: string) {
    const deal = await this.prisma.deal.findUniqueOrThrow({
      where: { id: dealId },
    });
    if (deal.purchaseMethod !== 'BANK_FINANCING') {
      throw new BadRequestException('Deal is not BANK_FINANCING');
    }
    if (deal.status !== 'FINALIZED') {
      throw new BadRequestException(
        'Deal must be FINALIZED before recording disbursement',
      );
    }
    await this.posting.postBankDisbursement(dealId, userId);
    await this.audit.log({
      entity: 'Deal',
      entityId: dealId,
      action: 'BANK_DISBURSEMENT',
      userId,
    });
    return this.findById(dealId);
  }

  // ── Finance Application ────────────────────────────────────────────────────

  async createFinanceApplication(dealId: string, data: any) {
    return this.prisma.$transaction(async (tx) => {
      // Auto-switch deal to BANK_FINANCING if not already set
      await tx.deal.update({
        where: { id: dealId },
        data: { purchaseMethod: 'BANK_FINANCING' },
      });
      return tx.financeApplication.upsert({
        where: { dealId },
        create: {
          dealId,
          applicantInfo: data.applicantInfo ?? {},
          creditScoreRange: data.creditScoreRange,
          lenderName: data.lenderName,
          bankName: data.bankName,
          bankBranch: data.bankBranch,
          termMonths: data.termMonths ? Number(data.termMonths) : undefined,
          apr: data.apr,
          interestType: data.interestType ?? undefined,
          monthlyPayment: data.monthlyPayment,
          requiredDocuments: data.documents?.length
            ? {
                create: data.documents.map((d: any) => ({
                  documentType: d.documentType,
                  notes: d.notes,
                })),
              }
            : undefined,
        },
        update: {
          applicantInfo: data.applicantInfo ?? {},
          creditScoreRange: data.creditScoreRange,
          lenderName: data.lenderName,
          bankName: data.bankName,
          bankBranch: data.bankBranch,
          termMonths: data.termMonths ? Number(data.termMonths) : undefined,
          apr: data.apr,
          interestType: data.interestType ?? undefined,
          monthlyPayment: data.monthlyPayment,
        },
        include: { requiredDocuments: true, bankApproval: true },
      });
    });
  }

  async updateFinanceApplication(dealId: string, data: any) {
    const app = await this.prisma.financeApplication.findUniqueOrThrow({
      where: { dealId },
    });
    return this.prisma.financeApplication.update({
      where: { id: app.id },
      data: {
        status: data.status,
        bankName: data.bankName,
        bankBranch: data.bankBranch,
        bankFinancingStatus: data.bankFinancingStatus,
        lenderName: data.lenderName,
        creditScoreRange: data.creditScoreRange,
        termMonths: data.termMonths ? Number(data.termMonths) : undefined,
        apr: data.apr,
        interestType: data.interestType ?? undefined,
        monthlyPayment: data.monthlyPayment,
        rejectionReason: data.rejectionReason,
      },
      include: { requiredDocuments: true, bankApproval: true },
    });
  }

  async addDocument(
    dealId: string,
    data: { documentType: string; fileUrl?: string; notes?: string },
  ) {
    const app = await this.prisma.financeApplication.findUniqueOrThrow({
      where: { dealId },
    });
    return this.prisma.bankFinancingDocument.create({
      data: { financeApplicationId: app.id, ...data },
    });
  }

  async updateDocument(
    dealId: string,
    docId: string,
    data: { status?: string; fileUrl?: string; notes?: string },
  ) {
    const app = await this.prisma.financeApplication.findUnique({
      where: { dealId },
    });
    if (!app) throw new NotFoundException(`No finance application for deal ${dealId}`);

    const doc = await this.prisma.bankFinancingDocument.findFirst({
      where: { id: docId, financeApplicationId: app.id },
    });
    if (!doc) throw new NotFoundException(`Document ${docId} not found`);

    const VALID_DOC_STATUSES = ['PENDING', 'SUBMITTED', 'VERIFIED', 'REJECTED'];
    const updateData: Record<string, any> = {};
    if (data.status !== undefined) {
      if (!VALID_DOC_STATUSES.includes(data.status))
        throw new BadRequestException(`Invalid document status: ${data.status}. Valid: ${VALID_DOC_STATUSES.join(', ')}`);
      updateData.status = data.status;
    }
    if (data.fileUrl !== undefined) { updateData.fileUrl = data.fileUrl; updateData.uploadedAt = new Date(); }
    if (data.notes !== undefined) updateData.notes = data.notes;

    return this.prisma.bankFinancingDocument.update({
      where: { id: docId },
      data: updateData,
    });
  }

  async recordBankApproval(
    dealId: string,
    data: {
      approvalReferenceNumber: string;
      approvedAmount: number;
      approvalDate: string;
      expiryDate?: string;
      approvalDocumentUrl?: string;
      notes?: string;
    },
  ) {
    // B-4: Atomic — upsert approval + update app + update deal in single transaction
    const app = await this.prisma.financeApplication.findUniqueOrThrow({
      where: { dealId },
    });
    const approval = await this.prisma.$transaction(async (tx) => {
      const appr = await tx.bankApproval.upsert({
        where: { financeApplicationId: app.id },
        update: {
          ...data,
          approvalDate: new Date(data.approvalDate),
          expiryDate: data.expiryDate ? new Date(data.expiryDate) : null,
        },
        create: {
          financeApplicationId: app.id,
          approvalReferenceNumber: data.approvalReferenceNumber,
          approvedAmount: data.approvedAmount,
          approvalDate: new Date(data.approvalDate),
          expiryDate: data.expiryDate ? new Date(data.expiryDate) : undefined,
          approvalDocumentUrl: data.approvalDocumentUrl,
          notes: data.notes,
        },
      });
      await tx.financeApplication.update({
        where: { id: app.id },
        data: { bankFinancingStatus: 'APPROVED', status: 'APPROVED' },
      });
      // Move deal to PENDING_FINANCE for final finance review before finalize
      await tx.deal.update({
        where: { id: dealId },
        data: { status: 'PENDING_FINANCE' },
      });
      return appr;
    });
    return approval;
  }

  // ── Commission splits ─────────────────────────────────────────────────────

  async addCommissionSplit(
    dealId: string,
    data: {
      userId: string;
      roleInDeal: string;
    },
    userId: string,
  ) {
    const deal = await this.prisma.deal.findUniqueOrThrow({
      where: { id: dealId, },
      include: {
        location: { select: { companyId: true } },
        vehicle: { select: { accreditedDealerId: true } },
      },
    });
    if (deal.status === 'FINALIZED')
      throw new BadRequestException(
        'Cannot modify commissions on a finalized deal',
      );

    const now = new Date();
    const periodStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

    const { amount, tierPctApplied } = await this.commissionConfig.resolveAmount({
      companyId: deal.location.companyId,
      salesRepUserId: data.userId,
      accreditedDealerId: deal.vehicle?.accreditedDealerId,
      periodStr,
    });

    const commission = await this.prisma.dealCommission.create({
      data: {
        dealId,
        userId: data.userId,
        roleInDeal: data.roleInDeal,
        baseAmount: amount,
        splitPercentage: 100,
        calculatedAmount: amount,
        tierPctApplied: tierPctApplied ?? undefined,
        status: 'ACCRUED',
      },
      include: {
        user: { select: { id: true, name: true } },
      },
    });

    // ponytail: validate total split % <= 100 after insert
    const splits = await this.prisma.dealCommission.findMany({
      where: { dealId },
    });
    const totalPct = splits.reduce(
      (s, c) => s + Number(c.splitPercentage ?? 100),
      0,
    );
    if (totalPct > 100) {
      await this.prisma.dealCommission.delete({ where: { id: commission.id } });
      throw new BadRequestException(
        `Commission split total ${totalPct}% exceeds 100%. Reduce the percentage.`,
      );
    }

    await this.audit.log({
      entity: 'DealCommission',
      entityId: commission.id,
      action: 'CREATE',
      userId,
      newValue: commission,
    });
    return commission;
  }

  async countOverdueInstallments() {
    return this.prisma.installmentLine.count({ where: { status: 'OVERDUE' } });
  }

  async listOverdueInstallments(limit = 20) {
    return this.prisma.installmentLine.findMany({
      where: { status: 'OVERDUE' },
      include: {
        installmentPlan: {
          include: {
            deal: {
              select: { id: true, customer: { select: { name: true } } },
            },
          },
        },
      },
      orderBy: { dueDate: 'asc' },
      take: limit,
    });
  }

  async removeCommissionSplit(
    dealId: string,
    commissionId: string,
    userId: string,
  ) {
    const c = await this.prisma.dealCommission.findUniqueOrThrow({
      where: { id: commissionId },
    });
    if (c.dealId !== dealId)
      throw new BadRequestException('Commission does not belong to this deal');
    if (c.status !== 'ACCRUED')
      throw new BadRequestException(
        'Cannot remove commission that has been paid or is payable',
      );
    await this.prisma.dealCommission.delete({ where: { id: commissionId } });
    await this.audit.log({
      entity: 'DealCommission',
      entityId: commissionId,
      action: 'DELETE',
      userId,
    });
    return { deleted: true };
  }

  async bulk(ids: string[], action: string, value: string | undefined, userId: string) {
    if (!ids?.length) throw new BadRequestException('ids required');
    const allowed = ['ASSIGN_REP', 'CHANGE_STATUS', 'CANCEL'];
    if (!allowed.includes(action)) throw new BadRequestException(`action must be one of ${allowed.join(', ')}`);

    const results: { id: string; ok: boolean; error?: string }[] = [];
    for (const id of ids) {
      try {
        if (action === 'ASSIGN_REP') {
          if (!value) throw new BadRequestException('value (salesRepId) required');
          await this.prisma.deal.update({ where: { id }, data: { salesRepId: value } });
          await this.audit.log({ entity: 'Deal', entityId: id, action: 'BULK_ASSIGN_REP', userId, newValue: { salesRepId: value } });
        } else if (action === 'CANCEL') {
          await this.cancel(id, userId);
        } else if (action === 'CHANGE_STATUS') {
          if (!value) throw new BadRequestException('value (status) required');
          await this.prisma.deal.update({ where: { id }, data: { status: value as any } });
          await this.audit.log({ entity: 'Deal', entityId: id, action: 'BULK_STATUS_CHANGE', userId, newValue: { status: value } });
        }
        results.push({ id, ok: true });
      } catch (e: any) {
        results.push({ id, ok: false, error: e?.message ?? 'unknown' });
      }
    }
    return { processed: results.length, succeeded: results.filter((r) => r.ok).length, results };
  }

  // ponytail: bounds enforcement per spec 09 — SALES_REP/MANAGER can't deviate >X% from location default
  private async assertFeeBounds(
    locationId: string,
    userRole: string,
    adminFee?: number,
    insuranceFee?: number,
  ) {
    if (!adminFee && !insuranceFee) return;
    if (['FINANCE', 'ADMIN', 'SUPER_ADMIN'].includes(userRole)) return;
    const loc = await this.prisma.location.findUniqueOrThrow({
      where: { id: locationId },
      include: {
        company: {
          select: {
            adminFeeBoundsPercent: true,
            insuranceFeeBoundsPercent: true,
          },
        },
      },
    });
    const adminBound = Number(loc.company?.adminFeeBoundsPercent ?? 20) / 100;
    const insBound = Number(loc.company?.insuranceFeeBoundsPercent ?? 20) / 100;
    const defaultAdmin = Number(loc.defaultAdminFee ?? 0);
    const defaultIns = Number(loc.defaultInsuranceFee ?? 0);

    if (adminFee !== undefined && defaultAdmin > 0) {
      const ratio = Math.abs(adminFee - defaultAdmin) / defaultAdmin;
      if (ratio > adminBound) {
        throw new ForbiddenException(
          `Admin fee ${adminFee} is outside ±${adminBound * 100}% of location default ${defaultAdmin}. Request a Finance override.`,
        );
      }
    }
    if (insuranceFee !== undefined && defaultIns > 0) {
      const ratio = Math.abs(insuranceFee - defaultIns) / defaultIns;
      if (ratio > insBound) {
        throw new ForbiddenException(
          `Insurance fee ${insuranceFee} is outside ±${insBound * 100}% of location default ${defaultIns}. Request a Finance override.`,
        );
      }
    }
  }

  async getNotes(dealId: string) {
    return this.prisma.dealNote.findMany({
      where: { dealId },
      include: { user: { select: { id: true, name: true, role: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async addNote(dealId: string, userId: string, data: { type?: string; content: string }) {
    return this.prisma.dealNote.create({
      data: {
        dealId,
        userId,
        type: data.type ?? 'NOTE',
        content: data.content,
      },
      include: { user: { select: { id: true, name: true, role: true } } },
    });
  }

  async deleteNote(noteId: string, userId: string, userRole: string) {
    const note = await this.prisma.dealNote.findUniqueOrThrow({ where: { id: noteId } });
    if (note.userId !== userId && !['ADMIN', 'SUPER_ADMIN'].includes(userRole)) {
      throw new ForbiddenException('Cannot delete another user\'s note');
    }
    return this.prisma.dealNote.delete({ where: { id: noteId } });
  }
}
