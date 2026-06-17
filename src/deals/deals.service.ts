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
      skip: (page - 1) * limit,
      take: limit,
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
        financeApplication: true,
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

    // resolve fee defaults from location if not provided
    const location = await this.prisma.location.findUniqueOrThrow({ where: { id: data.locationId } });
    const adminFee = data.adminFee ?? Number(location.defaultAdminFee ?? 0);
    const insuranceFee = data.insuranceFee ?? Number(location.defaultInsuranceFee ?? 0);

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
      include: { vehicle: true, location: true },
    });
    if (deal.status !== 'DRAFT' && deal.status !== 'PENDING_FINANCE') {
      throw new BadRequestException(`Deal ${id} is not in a finalizable state (status: ${deal.status})`);
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
    const lines = Array.from({ length: data.durationMonths }, (_, i) => {
      const dueDate = new Date(data.startDate);
      dueDate.setMonth(dueDate.getMonth() + i);
      // ponytail: flat calc — even split of principal/interest across months
      const principalPortion = data.principalAmount / data.durationMonths;
      const interestPortion = (data.totalPayable - data.principalAmount) / data.durationMonths;
      const totalDue = principalPortion + interestPortion;
      return {
        installmentNumber: i + 1,
        dueDate,
        principalPortion,
        interestPortion,
        totalDue,
        status: 'PENDING' as const,
        paidAmount: 0,
      };
    });

    const plan = await this.prisma.installmentPlan.create({
      data: {
        dealId,
        status: 'ACTIVE',
        principalAmount: data.principalAmount,
        downPayment: data.downPayment,
        interestRate: data.interestRate,
        durationMonths: data.durationMonths,
        calculationMethod: data.calculationMethod as any,
        totalPayable: data.totalPayable,
        monthlyInstallment: data.monthlyInstallment,
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
}
