import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';

@Injectable()
export class CarMakesService {
  constructor(private prisma: PrismaService) {}

  async listMakes(companyId: string) {
    return this.prisma.carMake.findMany({
      where: { companyId, isActive: true },
      orderBy: { name: 'asc' },
      include: { _count: { select: { models: true } } },
    });
  }

  async createMake(companyId: string, data: { name: string; slug: string; logoUrl?: string }) {
    const name = data.name.toUpperCase();
    const exists = await this.prisma.carMake.findUnique({
      where: { companyId_name: { companyId, name } },
    });
    if (exists) throw new ConflictException(`Make "${name}" already exists`);
    return this.prisma.carMake.create({
      data: { companyId, name, slug: data.slug, logoUrl: data.logoUrl ?? null },
    });
  }

  async updateMake(id: string, companyId: string, data: { name?: string; logoUrl?: string; isActive?: boolean }) {
    const make = await this.prisma.carMake.findFirst({ where: { id, companyId } });
    if (!make) throw new NotFoundException('Car make not found');
    const updateData = { ...data, ...(data.name ? { name: data.name.toUpperCase() } : {}) };
    if (updateData.name && updateData.name !== make.name) {
      const dup = await this.prisma.carMake.findUnique({
        where: { companyId_name: { companyId, name: updateData.name } },
      });
      if (dup) throw new ConflictException(`Make "${updateData.name}" already exists`);
    }
    return this.prisma.carMake.update({ where: { id }, data: updateData });
  }

  async listModels(makeId: string, companyId: string) {
    const make = await this.prisma.carMake.findFirst({ where: { id: makeId, companyId } });
    if (!make) throw new NotFoundException('Car make not found');
    return this.prisma.carModel.findMany({
      where: { makeId },
      orderBy: { name: 'asc' },
    });
  }

  async createModel(makeId: string, companyId: string, data: { name: string }) {
    const make = await this.prisma.carMake.findFirst({ where: { id: makeId, companyId } });
    if (!make) throw new NotFoundException('Car make not found');
    const exists = await this.prisma.carModel.findUnique({
      where: { makeId_name: { makeId, name: data.name } },
    });
    if (exists) throw new ConflictException(`Model "${data.name}" already exists for this make`);
    return this.prisma.carModel.create({ data: { makeId, name: data.name } });
  }

  async updateModel(modelId: string, companyId: string, data: { name?: string; isActive?: boolean }) {
    const model = await this.prisma.carModel.findFirst({
      where: { id: modelId, make: { companyId } },
      include: { make: true },
    });
    if (!model) throw new NotFoundException('Car model not found');
    if (data.name && data.name !== model.name) {
      const dup = await this.prisma.carModel.findUnique({
        where: { makeId_name: { makeId: model.makeId, name: data.name } },
      });
      if (dup) throw new ConflictException(`Model "${data.name}" already exists for this make`);
    }
    return this.prisma.carModel.update({ where: { id: modelId }, data });
  }
}
