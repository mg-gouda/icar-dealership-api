import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';

@Injectable()
export class AppointmentsService {
  constructor(private prisma: PrismaService) {}

  findAll(query: {
    locationId?: string; type?: string; status?: string;
    staffId?: string; date?: string; page?: number; limit?: number;
  }) {
    const { locationId, type, status, staffId, date, page = 1, limit = 20 } = query;
    return this.prisma.appointment.findMany({
      where: {
        ...(locationId && { locationId }),
        ...(type && { type: type as any }),
        ...(status && { status: status as any }),
        ...(staffId && { assignedToUserId: staffId }),
        ...(date && {
          scheduledAt: {
            gte: new Date(date),
            lt: new Date(new Date(date).setDate(new Date(date).getDate() + 1)),
          },
        }),
      },
      include: {
        customer: { select: { id: true, name: true, phone: true } },
        vehicle: { select: { id: true, make: true, model: true, year: true } },
        assignedTo: { select: { id: true, name: true } },
        location: { select: { id: true, name: true } },
      },
      orderBy: { scheduledAt: 'asc' },
      skip: (page - 1) * limit,
      take: limit,
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

  create(data: {
    locationId: string; customerId: string; vehicleId?: string;
    assignedToUserId?: string; type: string; scheduledAt: Date | string;
  }) {
    return this.prisma.appointment.create({
      data: {
        locationId: data.locationId,
        customerId: data.customerId,
        vehicleId: data.vehicleId,
        assignedToUserId: data.assignedToUserId!,
        type: data.type as any,
        scheduledAt: new Date(data.scheduledAt),
        status: 'SCHEDULED',
      },
    });
  }

  update(id: string, data: Partial<{
    status: string; scheduledAt: Date; assignedToUserId: string;
  }>) {
    return this.prisma.appointment.update({ where: { id }, data: data as any });
  }

  // ponytail: no CONFIRMED in AppointmentStatus enum — only SCHEDULED/COMPLETED/CANCELLED/NO_SHOW
  complete(id: string) {
    return this.prisma.appointment.update({
      where: { id },
      data: { status: 'COMPLETED' },
    });
  }

  cancel(id: string) {
    return this.prisma.appointment.update({
      where: { id },
      data: { status: 'CANCELLED' },
    });
  }
}
