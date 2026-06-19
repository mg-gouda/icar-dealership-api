import {
  Injectable, NotFoundException, BadRequestException, ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { PostingService } from '../finance/posting/posting.service';

@Injectable()
export class DealsService {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
    private posting: PostingService,
  ) {}

  findAll(query: {
    locationId?: string; status?: string; purchaseMethod?: string;
    salesRepId?: string; page?: number; limit?: number;
  }) {
    const { locationId, status, purchaseMethod, salesRepId, page = 1, limit = 20 } = query;
    return this.prisma.deal.findMany({
      where: {
        ...(locationId && { locationId }),
        ...(status && { status: status as any }),
        ...(purchaseMethod && { purchaseMethod: purchaseMethod as any }),
        ...(salesRepId && { salesRepId }),
      },
      include: {
        vehicle: { select: { id: true, make: true, model: true, year: true, price: true } },
        customer: { select: { id: true, name: true, phone: true, email: true } },
        salesRep: { select: { id: true, name: true } },
        location: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: 'desc' },
      skip: (Number(page) - 1) * Number(limit),
      take: Number(limit),
    });
  }

  async findById(id: string) {
    const deal = await this.prisma.deal.findUnique({
      where: { id },
      include: {
        vehicle: true,
        customer: true,
        salesRep: { select: { id: true, name: true } },
        location: true,
        installmentPlan: { include: { installments: { orderBy: { dueDate: 'asc' } } } },
        financeApplication: { include: { requiredDocuments: true, bankApproval: true } },
        commissions: { include: { user: { select: { id: true, name: true } } } },
        invoices: { select: { id: true, status: true, amountTotal: true, dueDate: true } },
      },
    });
    if (!deal) throw new NotFoundException(`Deal ${id} not found`);
    return deal;
  }

  async create(data: {
    locationId: string; vehicleId: string; customerId: string; salesRepId: string;
    purchaseMethod: string; salePrice: number; adminFee?: number; insuranceFee?: number;
    leadId?: string;
  }, userId: string) {
    // vehicle must be AVAILABLE
    const vehicle = await this.prisma.vehicle.findUniqueOrThrow({ where: { id: data.vehicleId } });
    if (vehicle.status !== 'AVAILABLE') {
      throw new BadRequestException(`Vehicle ${data.vehicleId} is not available (status: ${vehicle.status})`);
    }

    // Fee cascade: explicit value → vehicle override → location default
    const location = await this.prisma.location.findUniqueOrThrow({ where: { id: data.locationId } });
    const adminFee = data.adminFee ?? Number(vehicle.adminFeeOverride ?? location.defaultAdminFee ?? 0);
    const insuranceFee = data.insuranceFee ?? Number(vehicle.insuranceFeeOverride ?? location.defaultInsuranceFee ?? 0);

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
        },
      });
      // mark vehicle RESERVED while deal is open
      await tx.vehicle.update({ where: { id: data.vehicleId }, data: { status: 'RESERVED' } });
      return d;
    });

    await this.audit.log({ entity: 'Deal', entityId: deal.id, action: 'CREATE', userId, newValue: deal });
    return deal;
  }

  async update(id: string, data: Partial<{
    salePrice: number; adminFee: number; insuranceFee: number;
    salesRepId: string; purchaseMethod: string;
  }>, userId: string) {
    const deal = await this.prisma.deal.findUniqueOrThrow({ where: { id } });
    if (deal.status === 'FINALIZED') throw new BadRequestException('Cannot edit a finalized deal');

    const updated = await this.prisma.deal.update({ where: { id }, data: data as any });
    await this.audit.log({ entity: 'Deal', entityId: id, action: 'UPDATE', userId, newValue: data });
    return updated;
  }

  async finalize(id: string, userId: string) {
    const deal = await this.prisma.deal.findUniqueOrThrow({
      where: { id },
      include: { vehicle: true, location: true, financeApplication: { include: { bankApproval: true } } },
    });
    if (deal.status !== 'DRAFT' && deal.status !== 'PENDING_FINANCE') {
      throw new BadRequestException(`Deal ${id} is not in a finalizable state (status: ${deal.status})`);
    }
    if (deal.purchaseMethod === 'BANK_FINANCING') {
      if ((deal as any).bankFinancingStatus !== 'APPROVED' || !(deal as any).financeApplication?.bankApproval) {
        throw new BadRequestException('Bank financing deals require an approved bank approval before finalizing.');
      }
    }

    await this.prisma.$transaction(async () => {
      await this.posting.finalizeDeal(id, userId);
    });

    await this.audit.log({ entity: 'Deal', entityId: id, action: 'FINALIZE', userId });
    return this.findById(id);
  }

  async cancel(id: string, userId: string) {
    const deal = await this.prisma.deal.findUniqueOrThrow({ where: { id } });
    if (deal.status === 'FINALIZED') throw new ForbiddenException('Cannot cancel a finalized deal');

    await this.prisma.$transaction(async (tx) => {
      await tx.deal.update({ where: { id }, data: { status: 'CANCELLED' } });
      // release vehicle back to AVAILABLE
      await tx.vehicle.update({ where: { id: deal.vehicleId }, data: { status: 'AVAILABLE' } });

      // ponytail: commission clawback -- reverse any ACCRUED/PAYABLE commissions
      await this.posting.clawbackCommissions(id, userId, tx);
    });

    await this.audit.log({ entity: 'Deal', entityId: id, action: 'CANCEL', userId });
    return this.findById(id);
  }

  async addInstallmentPlan(dealId: string, data: {
    principalAmount: number; downPayment: number; interestRate: number;
    durationMonths: number; calculationMethod: string;
    totalPayable: number; monthlyInstallment?: number; startDate: Date;
  }, userId: string) {
    const deal = await this.prisma.deal.findUniqueOrThrow({ where: { id: dealId } });
    if (deal.purchaseMethod !== 'DEALERSHIP_INSTALLMENT') {
      throw new BadRequestException('Deal purchase method is not DEALERSHIP_INSTALLMENT');
    }

    // Generate installment lines
    const lines: Array<{
      installmentNumber: number; dueDate: Date;
      principalPortion: number; interestPortion: number; totalDue: number;
      status: 'PENDING'; paidAmount: number;
    }> = [];

    const principal = data.principalAmount;
    const n = data.durationMonths;
    const monthlyRate = data.interestRate / 12 / 100; // annual rate -> monthly decimal

    if (data.calculationMethod === 'AMORTIZING' && monthlyRate > 0) {
      // ponytail: reducing-balance PMT formula
      const pmt = (principal * monthlyRate) / (1 - Math.pow(1 + monthlyRate, -n));
      let balance = principal;

      for (let i = 0; i < n; i++) {
        const interestPortion = Math.round(balance * monthlyRate * 100) / 100;
        const principalPortion = Math.round((pmt - interestPortion) * 100) / 100;
        const dueDate = new Date(data.startDate);
        dueDate.setMonth(dueDate.getMonth() + i);
        lines.push({
          installmentNumber: i + 1,
          dueDate,
          principalPortion,
          interestPortion,
          totalDue: Math.round((principalPortion + interestPortion) * 100) / 100,
          status: 'PENDING',
          paidAmount: 0,
        });
        balance -= principalPortion;
      }

      // Adjust last line for rounding residual
      const totalPrincipal = lines.reduce((s, l) => s + l.principalPortion, 0);
      const residual = Math.round((principal - totalPrincipal) * 100) / 100;
      if (Math.abs(residual) > 0.001) {
        lines[lines.length - 1].principalPortion += residual;
        lines[lines.length - 1].totalDue += residual;
      }
    } else {
      // Flat calc -- even split of principal/interest across months
      for (let i = 0; i < n; i++) {
        const dueDate = new Date(data.startDate);
        dueDate.setMonth(dueDate.getMonth() + i);
        const principalPortion = principal / n;
        const interestPortion = (data.totalPayable - principal) / n;
        const totalDue = principalPortion + interestPortion;
        lines.push({
          installmentNumber: i + 1,
          dueDate,
          principalPortion,
          interestPortion,
          totalDue,
          status: 'PENDING',
          paidAmount: 0,
        });
      }
    }

    // ponytail: compute totals from generated lines for accuracy
    const computedTotal = lines.reduce((s, l) => s + l.totalDue, 0);
    const computedMonthly = data.calculationMethod === 'AMORTIZING'
      ? undefined // varies per line
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
        startDate: new Date(data.startDate),
        installments: {
          createMany: { data: lines },
        },
      },
      include: { installments: true },
    });
    await this.audit.log({ entity: 'InstallmentPlan', entityId: plan.id, action: 'CREATE', userId, newValue: plan });
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
      throw new BadRequestException('Installment line does not belong to this deal');
    }
    if (line.status === 'PAID') {
      throw new BadRequestException('Installment line already paid');
    }
    await this.posting.postInstallment(lineId, userId);
    await this.audit.log({ entity: 'InstallmentLine', entityId: lineId, action: 'COLLECT', userId });
    return this.findById(dealId);
  }

  // ── Bank disbursement ─────────────────────────────────────────────────────

  async postBankDisbursement(dealId: string, userId: string) {
    const deal = await this.prisma.deal.findUniqueOrThrow({ where: { id: dealId } });
    if (deal.purchaseMethod !== 'BANK_FINANCING') {
      throw new BadRequestException('Deal is not BANK_FINANCING');
    }
    if (deal.status !== 'FINALIZED') {
      throw new BadRequestException('Deal must be FINALIZED before recording disbursement');
    }
    await this.posting.postBankDisbursement(dealId, userId);
    await this.audit.log({ entity: 'Deal', entityId: dealId, action: 'BANK_DISBURSEMENT', userId });
    return this.findById(dealId);
  }

  // ── Finance Application ────────────────────────────────────────────────────

  async createFinanceApplication(dealId: string, data: any) {
    const deal = await this.prisma.deal.findUniqueOrThrow({ where: { id: dealId } });
    if (deal.purchaseMethod !== 'BANK_FINANCING') {
      throw new Error('Finance applications only apply to BANK_FINANCING deals');
    }
    return this.prisma.financeApplication.create({
      data: {
        dealId,
        applicantInfo: data.applicantInfo ?? {},
        creditScoreRange: data.creditScoreRange,
        lenderName: data.lenderName,
        bankName: data.bankName,
        bankBranch: data.bankBranch,
        termMonths: data.termMonths ? Number(data.termMonths) : undefined,
        apr: data.apr,
        monthlyPayment: data.monthlyPayment,
        requiredDocuments: data.documents?.length ? {
          create: data.documents.map((d: any) => ({ documentType: d.documentType, notes: d.notes })),
        } : undefined,
      },
      include: { requiredDocuments: true, bankApproval: true },
    });
  }

  async updateFinanceApplication(dealId: string, data: any) {
    const app = await this.prisma.financeApplication.findUniqueOrThrow({ where: { dealId } });
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
        monthlyPayment: data.monthlyPayment,
        rejectionReason: data.rejectionReason,
      },
      include: { requiredDocuments: true, bankApproval: true },
    });
  }

  async addDocument(dealId: string, data: { documentType: string; fileUrl?: string; notes?: string }) {
    const app = await this.prisma.financeApplication.findUniqueOrThrow({ where: { dealId } });
    return this.prisma.bankFinancingDocument.create({
      data: { financeApplicationId: app.id, ...data },
    });
  }

  async updateDocument(dealId: string, docId: string, data: { status?: string; fileUrl?: string; notes?: string }) {
    const app = await this.prisma.financeApplication.findUniqueOrThrow({ where: { dealId } });
    return this.prisma.bankFinancingDocument.update({
      where: { id: docId, financeApplicationId: app.id },
      data: {
        status: data.status as any,
        fileUrl: data.fileUrl,
        notes: data.notes,
        uploadedAt: data.fileUrl ? new Date() : undefined,
      },
    });
  }

  async recordBankApproval(dealId: string, data: {
    approvalReferenceNumber: string; approvedAmount: number;
    approvalDate: string; expiryDate?: string; approvalDocumentUrl?: string; notes?: string;
  }) {
    const app = await this.prisma.financeApplication.findUniqueOrThrow({ where: { dealId } });
    const approval = await this.prisma.bankApproval.upsert({
      where: { financeApplicationId: app.id },
      update: { ...data, approvalDate: new Date(data.approvalDate), expiryDate: data.expiryDate ? new Date(data.expiryDate) : null },
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
    await this.prisma.financeApplication.update({
      where: { id: app.id },
      data: { bankFinancingStatus: 'APPROVED', status: 'APPROVED' },
    });
    // Move deal to PENDING_FINANCE for final finance review before finalize
    await this.prisma.deal.update({ where: { id: dealId }, data: { status: 'PENDING_FINANCE' } });
    return approval;
  }

  // ── Commission splits ─────────────────────────────────────────────────────

  private async resolveCommissionAmount(baseAmount: number, splitPercentage: number, commissionPlanId?: string): Promise<number> {
    if (!commissionPlanId) return (baseAmount * splitPercentage) / 100;

    const plan = await this.prisma.commissionPlan.findUnique({
      where: { id: commissionPlanId },
      include: { tiers: { orderBy: { minValue: 'asc' } } },
    });
    if (!plan) return (baseAmount * splitPercentage) / 100;

    let planRate = 0;
    if (plan.basisType === 'FLAT_AMOUNT') {
      planRate = Number(plan.flatAmount ?? 0);
      return (planRate * splitPercentage) / 100;
    }
    if (plan.basisType === 'PERCENT_OF_SALE_PRICE' || plan.basisType === 'PERCENT_OF_GROSS_PROFIT') {
      planRate = Number(plan.percentage ?? 0);
      return (baseAmount * planRate / 100 * splitPercentage) / 100;
    }
    if (plan.basisType === 'TIERED') {
      // Find the applicable tier by minValue threshold
      const applicableTier = [...plan.tiers].reverse().find((t) => baseAmount >= Number(t.minValue));
      if (!applicableTier) return 0;
      const tierBase = applicableTier.rateType === 'FLAT_AMOUNT'
        ? Number(applicableTier.rateValue)
        : baseAmount * Number(applicableTier.rateValue) / 100;
      return (tierBase * splitPercentage) / 100;
    }
    return (baseAmount * splitPercentage) / 100;
  }

  async addCommissionSplit(dealId: string, data: {
    userId: string; roleInDeal: string; commissionPlanId?: string;
    baseAmount: number; splitPercentage: number;
  }, userId: string) {
    const deal = await this.prisma.deal.findUniqueOrThrow({ where: { id: dealId } });
    if (deal.status === 'FINALIZED') throw new BadRequestException('Cannot modify commissions on a finalized deal');

    const calculatedAmount = await this.resolveCommissionAmount(data.baseAmount, data.splitPercentage, data.commissionPlanId);

    const commission = await this.prisma.dealCommission.create({
      data: {
        dealId,
        userId: data.userId,
        roleInDeal: data.roleInDeal,
        commissionPlanId: data.commissionPlanId,
        baseAmount: data.baseAmount,
        splitPercentage: data.splitPercentage,
        calculatedAmount,
        status: 'ACCRUED',
      },
      include: { user: { select: { id: true, name: true } }, commissionPlan: { select: { name: true } } },
    });

    // ponytail: validate total split % <= 100 after insert
    const splits = await this.prisma.dealCommission.findMany({ where: { dealId } });
    const totalPct = splits.reduce((s, c) => s + Number(c.splitPercentage ?? 100), 0);
    if (totalPct > 100) {
      await this.prisma.dealCommission.delete({ where: { id: commission.id } });
      throw new BadRequestException(`Commission split total ${totalPct}% exceeds 100%. Reduce the percentage.`);
    }

    await this.audit.log({ entity: 'DealCommission', entityId: commission.id, action: 'CREATE', userId, newValue: commission });
    return commission;
  }

  async removeCommissionSplit(dealId: string, commissionId: string, userId: string) {
    const c = await this.prisma.dealCommission.findUniqueOrThrow({ where: { id: commissionId } });
    if (c.dealId !== dealId) throw new BadRequestException('Commission does not belong to this deal');
    if (c.status !== 'ACCRUED') throw new BadRequestException('Cannot remove commission that has been paid or is payable');
    await this.prisma.dealCommission.delete({ where: { id: commissionId } });
    await this.audit.log({ entity: 'DealCommission', entityId: commissionId, action: 'DELETE', userId });
    return { deleted: true };
  }
}
