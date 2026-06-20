import {
  Injectable,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../common/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';

@Injectable()
export class UsersService {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
  ) {}

  async findAll(locationId?: string) {
    return this.prisma.user.findMany({
      where: locationId ? { locationId } : undefined,
      select: {
        id: true,
        email: true,
        name: true,
        phone: true,
        role: true,
        locationId: true,
        isActive: true,
        createdAt: true,
        location: { select: { name: true } },
        permissions: { select: { permissionKey: true, granted: true } },
      },
    });
  }

  async findById(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        email: true,
        name: true,
        phone: true,
        role: true,
        locationId: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
        location: { select: { id: true, name: true } },
        permissions: {
          select: { id: true, permissionKey: true, granted: true },
        },
        workingHours: true,
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
    const existing = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });
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
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        locationId: true,
        createdAt: true,
      },
    });
  }

  async update(
    id: string,
    dto: Partial<{
      name: string;
      phone: string;
      role: string;
      locationId: string;
    }>,
  ) {
    await this.findById(id);
    return this.prisma.user.update({
      where: { id },
      data: dto as any,
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        locationId: true,
        updatedAt: true,
      },
    });
  }

  async setActive(id: string, isActive: boolean) {
    await this.findById(id);
    return this.prisma.user.update({
      where: { id },
      data: { isActive },
      select: { id: true, isActive: true },
    });
  }

  // ── Permission overrides ────────────────────────────────────────────────────

  async grantPermission(
    userId: string,
    permissionKey: string,
    granted: boolean,
    grantedByUserId: string,
  ) {
    await this.findById(userId);
    const perm = await this.prisma.userPermission.upsert({
      where: { userId_permissionKey: { userId, permissionKey } },
      update: { granted },
      create: { userId, permissionKey, granted },
    });
    this.audit
      .log({
        entity: 'UserPermission',
        entityId: perm.id,
        action: granted ? 'PERMISSION_GRANTED' : 'PERMISSION_REVOKED',
        userId: grantedByUserId,
        newValue: { targetUserId: userId, permissionKey, granted },
      })
      .catch(() => {});
    return perm;
  }

  async revokePermission(
    userId: string,
    permissionKey: string,
    revokedByUserId: string,
  ) {
    const existing = await this.prisma.userPermission.findUnique({
      where: { userId_permissionKey: { userId, permissionKey } },
    });
    if (!existing) throw new NotFoundException('Permission override not found');
    await this.prisma.userPermission.delete({
      where: { userId_permissionKey: { userId, permissionKey } },
    });
    this.audit
      .log({
        entity: 'UserPermission',
        entityId: existing.id,
        action: 'PERMISSION_OVERRIDE_DELETED',
        userId: revokedByUserId,
        newValue: { targetUserId: userId, permissionKey },
      })
      .catch(() => {});
    return { deleted: true };
  }

  // ── Working hours ───────────────────────────────────────────────────────────

  async getWorkingHours(userId: string) {
    await this.findById(userId);
    return this.prisma.workingHours.findMany({
      where: { userId },
      orderBy: { dayOfWeek: 'asc' },
    });
  }

  async upsertWorkingHours(
    userId: string,
    hours: Array<{ dayOfWeek: number; startTime: string; endTime: string }>,
  ) {
    await this.findById(userId);
    await this.prisma.$transaction(
      hours.map((h) =>
        this.prisma.workingHours.upsert({
          where: { userId_dayOfWeek: { userId, dayOfWeek: h.dayOfWeek } },
          update: { startTime: h.startTime, endTime: h.endTime },
          create: {
            userId,
            dayOfWeek: h.dayOfWeek,
            startTime: h.startTime,
            endTime: h.endTime,
          },
        }),
      ),
    );
    return this.getWorkingHours(userId);
  }
}
