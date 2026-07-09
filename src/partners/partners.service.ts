import { Injectable } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';
import { CreatePartnerDto } from './dto/create-partner.dto';
import { UpdatePartnerDto } from './dto/update-partner.dto';

export interface PartnerListFilters {
  type?: string;
  q?: string;
  page?: number;
  limit?: number;
}

@Injectable()
export class PartnersService {
  constructor(private prisma: PrismaService) {}

  async list(filters: PartnerListFilters = {}) {
    const { type, q, page = 1, limit = 50 } = filters;
    const where: any = {};
    if (type) where.type = type;
    if (q) where.name = { contains: q, mode: 'insensitive' };

    return this.prisma.partner.findMany({
      where,
      skip: (page - 1) * limit,
      take: limit,
      orderBy: { name: 'asc' },
    });
  }

  async findById(id: string) {
    return this.prisma.partner.findUniqueOrThrow({ where: { id } });
  }

  async create(dto: CreatePartnerDto) {
    return this.prisma.partner.create({ data: dto });
  }

  async update(id: string, dto: UpdatePartnerDto) {
    return this.prisma.partner.update({ where: { id }, data: dto });
  }
}
