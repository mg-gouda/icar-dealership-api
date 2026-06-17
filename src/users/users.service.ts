import { Injectable, ConflictException, NotFoundException } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../common/prisma/prisma.service';

@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService) {}

  async findAll(locationId?: string) {
    return this.prisma.user.findMany({
      where: locationId ? { locationId } : undefined,
      select: {
        id: true, email: true, name: true, phone: true, role: true,
        locationId: true, createdAt: true,
      },
    });
  }

  async findById(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: {
        id: true, email: true, name: true, phone: true, role: true,
        locationId: true, permissions: true, createdAt: true, updatedAt: true,
      },
    });
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  async create(dto: {
    email: string;
    password: string;
    name: string;
    phone?: string;
    role: string;
    locationId?: string;
  }) {
    const existing = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (existing) throw new ConflictException('Email already in use');
    const passwordHash = await bcrypt.hash(dto.password, 12);
    return this.prisma.user.create({
      data: {
        email: dto.email,
        passwordHash,
        name: dto.name,
        phone: dto.phone,
        role: dto.role as any,
        locationId: dto.locationId,
      },
      select: { id: true, email: true, name: true, role: true, locationId: true, createdAt: true },
    });
  }

  async update(id: string, dto: Partial<{ name: string; phone: string; role: string; locationId: string }>) {
    await this.findById(id);
    return this.prisma.user.update({
      where: { id },
      data: dto as any,
      select: { id: true, email: true, name: true, role: true, locationId: true, updatedAt: true },
    });
  }
}
