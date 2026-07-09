import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';

@Injectable()
export class AppointmentsService {
  constructor(private prisma: PrismaService) {}

  findAll(query: {
    locationId?: string;
    type?: string;
    status?: string;
    staffId?: string;
    date?: string;
    dateFrom?: string;
    dateTo?: string;
    page?: number;
    limit?: number;
  }) {
    const {
      locationId,
      type,
      status,
      staffId,
      date,
      dateFrom,
      dateTo,
      page = 1,
      limit = 20,
    } = query;
    // ponytail: date=single day; dateFrom+dateTo=range (for calendar view)
    const dateFilter = date
      ? {
          gte: new Date(date),
          lt: new Date(new Date(date).setDate(new Date(date).getDate() + 1)),
        }
      : dateFrom || dateTo
        ? {
            ...(dateFrom && { gte: new Date(dateFrom) }),
            ...(dateTo && { lte: new Date(dateTo) }),
          }
        : undefined;
    return this.prisma.appointment.findMany({
      where: {
        ...(locationId && { locationId }),
        ...(type && { type: type as any }),
        ...(status && { status: status as any }),
        ...(staffId && { assignedToUserId: staffId }),
        ...(dateFilter && { scheduledAt: dateFilter }),
      },
      include: {
        customer: { select: { id: true, name: true, phone: true } },
        vehicle: { select: { id: true, make: true, model: true, year: true } },
        assignedTo: { select: { id: true, name: true } },
        location: { select: { id: true, name: true } },
      },
      orderBy: { scheduledAt: 'asc' },
      skip: (Number(page) - 1) * Number(limit),
      take: Number(limit),
    });
  }

  async findById(id: string) {
    const appt = await this.prisma.appointment.findUnique({
      where: { id },
      include: {
        customer: true,
        vehicle: true,
        assignedTo: true,
        location: true,
      },
    });
    if (!appt) throw new NotFoundException(`Appointment ${id} not found`);
    return appt;
  }

  async create(data: {
    locationId: string;
    customerId: string;
    vehicleId?: string;
    assignedToUserId?: string;
    type: string;
    scheduledAt: Date | string;
    createdByUserId?: string;
  }) {
    // Auto-assign to caller if not specified
    const assignedToUserId = data.assignedToUserId ?? data.createdByUserId;
    if (!assignedToUserId) {
      throw new BadRequestException('assignedToUserId is required');
    }
    return this.prisma.appointment.create({
      data: {
        locationId: data.locationId,
        customerId: data.customerId,
        vehicleId: data.vehicleId,
        assignedToUserId,
        type: data.type as any,
        scheduledAt: new Date(data.scheduledAt),
        status: 'SCHEDULED',
      },
    });
  }

  update(
    id: string,
    data: Partial<{
      status: string;
      scheduledAt: Date | string;
      assignedToUserId: string;
    }>,
  ) {
    return this.prisma.appointment.update({ where: { id }, data: data as any });
  }

  // ponytail: no CONFIRMED in AppointmentStatus enum — only SCHEDULED/COMPLETED/CANCELLED/NO_SHOW
  async complete(id: string) {
    const appt = await this.prisma.appointment.findUniqueOrThrow({ where: { id }, select: { status: true } });
    if (appt.status === 'CANCELLED') {
      throw new BadRequestException('Cannot complete a cancelled appointment');
    }
    if (appt.status === 'COMPLETED') {
      throw new BadRequestException('Appointment already completed');
    }
    return this.prisma.appointment.update({
      where: { id },
      data: { status: 'COMPLETED' },
    });
  }

  async cancel(id: string) {
    const appt = await this.prisma.appointment.findUniqueOrThrow({ where: { id }, select: { status: true } });
    if (appt.status === 'COMPLETED') {
      throw new BadRequestException('Cannot cancel a completed appointment');
    }
    if (appt.status === 'CANCELLED') {
      throw new BadRequestException('Appointment already cancelled');
    }
    return this.prisma.appointment.update({
      where: { id },
      data: { status: 'CANCELLED' },
    });
  }
}
