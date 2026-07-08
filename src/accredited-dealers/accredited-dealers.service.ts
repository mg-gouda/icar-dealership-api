import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';

@Injectable()
export class AccreditedDealersService {
  constructor(private prisma: PrismaService) {}

  list(companyId: string) {
    return this.prisma.accreditedDealer.findMany({
      where: { companyId },
      orderBy: { name: 'asc' },
    });
  }

  async getById(id: string, companyId: string) {
    const d = await this.prisma.accreditedDealer.findFirst({ where: { id, companyId } });
    if (!d) throw new NotFoundException('Dealer not found');
    return d;
  }

  create(companyId: string, data: {
    name: string;
    contactName?: string;
    contactPhone?: string;
    contactEmail?: string;
    carMakes?: string[];
    gracePeriodDays?: number;
    monthlyTarget?: number;
    minimumMonthly?: number;
    targetBonus?: number;
    kickbackPercent?: number;
  }) {
    return this.prisma.accreditedDealer.create({ data: { ...data, companyId } });
  }

  async update(id: string, companyId: string, data: Partial<{
    name: string;
    contactName: string;
    contactPhone: string;
    contactEmail: string;
    carMakes: string[];
    gracePeriodDays: number;
    monthlyTarget: number;
    minimumMonthly: number;
    targetBonus: number;
    kickbackPercent: number;
    active: boolean;
  }>) {
    await this.getById(id, companyId);
    return this.prisma.accreditedDealer.update({ where: { id }, data });
  }

  async remove(id: string, companyId: string) {
    await this.getById(id, companyId);
    await this.prisma.accreditedDealer.delete({ where: { id } });
    return { deleted: true };
  }
}
