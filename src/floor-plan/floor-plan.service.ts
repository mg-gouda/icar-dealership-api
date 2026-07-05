import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';

const COMPANY_ID = 'company-001';

@Injectable()
export class FloorPlanService {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
  ) {}

  async findAll(query: {
    locationId?: string;
    status?: string;
    lender?: string;
    page?: number;
    limit?: number;
  }) {
    const { locationId, status, lender, page = 1, limit = 20 } = query;
    const where = {
      companyId: COMPANY_ID,
      ...(locationId && { locationId }),
      ...(status && { status: status as any }),
      ...(lender && { lender: { contains: lender, mode: 'insensitive' as const } }),
    };
    const [data, total] = await this.prisma.$transaction([
      this.prisma.floorPlanNote.findMany({
        where,
        include: {
          vehicle: {
            select: { id: true, vin: true, make: true, model: true, year: true },
          },
          location: { select: { id: true, name: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (Number(page) - 1) * Number(limit),
        take: Number(limit),
      }),
      this.prisma.floorPlanNote.count({ where }),
    ]);
    return { data, total, page: Number(page), limit: Number(limit) };
  }

  async findById(id: string) {
    const note = await this.prisma.floorPlanNote.findUnique({
      where: { id },
      include: {
        vehicle: {
          select: { id: true, vin: true, make: true, model: true, year: true, price: true, cost: true },
        },
        location: { select: { id: true, name: true } },
      },
    });
    if (!note) throw new NotFoundException(`FloorPlanNote ${id} not found`);
    return note;
  }

  async create(
    data: {
      vehicleId: string;
      lender: string;
      principalAmount: number;
      interestRate: number;
      startDate: string;
      maturityDate: string;
      locationId: string;
    },
    userId: string,
  ) {
    const note = await this.prisma.floorPlanNote.create({
      data: {
        vehicleId: data.vehicleId,
        lender: data.lender,
        principalAmount: data.principalAmount,
        interestRate: data.interestRate,
        startDate: new Date(data.startDate),
        maturityDate: new Date(data.maturityDate),
        locationId: data.locationId,
        companyId: COMPANY_ID,
        status: 'ACTIVE',
      },
    });
    await this.audit.log({
      entity: 'FloorPlanNote',
      entityId: note.id,
      action: 'CREATE',
      userId,
      newValue: note,
    });
    return note;
  }

  async update(
    id: string,
    data: {
      lender?: string;
      principalAmount?: number;
      interestRate?: number;
      maturityDate?: string;
    },
    userId: string,
  ) {
    const note = await this.prisma.floorPlanNote.findUniqueOrThrow({ where: { id } });
    if (note.status === 'PAID_OFF') {
      throw new BadRequestException('Cannot update a paid-off floor plan note');
    }
    const updated = await this.prisma.floorPlanNote.update({
      where: { id },
      data: {
        ...(data.lender !== undefined && { lender: data.lender }),
        ...(data.principalAmount !== undefined && { principalAmount: data.principalAmount }),
        ...(data.interestRate !== undefined && { interestRate: data.interestRate }),
        ...(data.maturityDate && { maturityDate: new Date(data.maturityDate) }),
      },
    });
    await this.audit.log({
      entity: 'FloorPlanNote',
      entityId: id,
      action: 'UPDATE',
      userId,
      newValue: data,
    });
    return updated;
  }

  async payOff(id: string, userId: string) {
    const note = await this.prisma.floorPlanNote.findUniqueOrThrow({
      where: { id },
    });
    if (note.status === 'PAID_OFF') {
      throw new BadRequestException('Floor plan note already paid off');
    }

    // Resolve GL accounts
    const payableAccount = await this.prisma.account.findFirst({
      where: { companyId: COMPANY_ID, code: '2110' },
    });
    const bankAccount = await this.prisma.account.findFirst({
      where: { companyId: COMPANY_ID, type: 'ASSET', code: '1200' },
    });
    if (!payableAccount || !bankAccount) {
      throw new BadRequestException(
        'GL accounts 2110 (Floor Plan Payable) or 1200 (Bank) not found. Run seed.',
      );
    }

    const journal = await this.prisma.journal.findFirst({
      where: { locationId: note.locationId, type: { in: ['BANK', 'GENERAL'] } },
    });
    if (!journal) {
      throw new BadRequestException('No BANK/GENERAL journal on location');
    }

    const now = new Date();
    const amount = Number(note.principalAmount);

    const result = await this.prisma.$transaction(async (tx) => {
      // 1. GL: DR Floor Plan Payable / CR Bank
      await tx.journalEntry.create({
        data: {
          journalId: journal.id,
          date: now,
          ref: `FP-PAY-${id.slice(-8).toUpperCase()}`,
          status: 'POSTED',
          lines: {
            create: [
              {
                accountId: payableAccount.id,
                debit: amount,
                credit: 0,
                label: `Floor Plan Payoff - ${note.lender}`,
              },
              {
                accountId: bankAccount.id,
                debit: 0,
                credit: amount,
                label: 'Bank - Floor Plan Payoff',
              },
            ],
          },
        },
      });

      // 2. Update note
      return tx.floorPlanNote.update({
        where: { id },
        data: {
          status: 'PAID_OFF',
          paidOffDate: now,
          paidOffAmount: amount,
        },
      });
    });

    await this.audit.log({
      entity: 'FloorPlanNote',
      entityId: id,
      action: 'FLOOR_PLAN_PAID_OFF',
      userId,
      newValue: { paidOffAmount: amount },
    });
    return result;
  }

  async summary() {
    const notes = await this.prisma.floorPlanNote.findMany({
      where: { companyId: COMPANY_ID, status: 'ACTIVE' },
      select: { lender: true, principalAmount: true },
    });

    // ponytail: group by lender, sum principal
    const byLender: Record<string, { lender: string; totalExposure: number; count: number }> = {};
    for (const n of notes) {
      if (!byLender[n.lender]) {
        byLender[n.lender] = { lender: n.lender, totalExposure: 0, count: 0 };
      }
      byLender[n.lender].totalExposure += Number(n.principalAmount);
      byLender[n.lender].count += 1;
    }

    const lenders = Object.values(byLender).sort(
      (a, b) => b.totalExposure - a.totalExposure,
    );
    const grandTotal = lenders.reduce((s, l) => s + l.totalExposure, 0);

    return { lenders, grandTotal, totalActiveNotes: notes.length };
  }
}
