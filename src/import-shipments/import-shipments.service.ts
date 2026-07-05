import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';

const COMPANY_ID = 'company-001';

@Injectable()
export class ImportShipmentsService {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
  ) {}

  async findAll(query: {
    locationId?: string;
    status?: string;
    page?: number;
    limit?: number;
  }) {
    const { locationId, status, page = 1, limit = 20 } = query;
    const where = {
      companyId: COMPANY_ID,
      ...(locationId && { locationId }),
      ...(status && { status: status as any }),
    };
    const [data, total] = await this.prisma.$transaction([
      this.prisma.importShipment.findMany({
        where,
        include: {
          location: { select: { id: true, name: true } },
          _count: { select: { vehicles: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (Number(page) - 1) * Number(limit),
        take: Number(limit),
      }),
      this.prisma.importShipment.count({ where }),
    ]);
    return { data, total, page: Number(page), limit: Number(limit) };
  }

  async findById(id: string) {
    const shipment = await this.prisma.importShipment.findUnique({
      where: { id },
      include: {
        location: { select: { id: true, name: true } },
        vehicles: {
          include: {
            vehicle: {
              select: { id: true, vin: true, make: true, model: true, year: true, price: true, cost: true },
            },
          },
        },
      },
    });
    if (!shipment) throw new NotFoundException(`ImportShipment ${id} not found`);
    return shipment;
  }

  async create(
    data: {
      shipmentNumber: string;
      locationId: string;
      supplier?: string;
      origin?: string;
      shipDate?: string;
      arrivalDate?: string;
      portFees?: number;
      shippingCost?: number;
      clearanceAgentFee?: number;
      otherCosts?: number;
    },
    userId: string,
  ) {
    const shipment = await this.prisma.importShipment.create({
      data: {
        shipmentNumber: data.shipmentNumber,
        locationId: data.locationId,
        companyId: COMPANY_ID,
        supplier: data.supplier,
        origin: data.origin,
        shipDate: data.shipDate ? new Date(data.shipDate) : undefined,
        arrivalDate: data.arrivalDate ? new Date(data.arrivalDate) : undefined,
        portFees: data.portFees ?? 0,
        shippingCost: data.shippingCost ?? 0,
        clearanceAgentFee: data.clearanceAgentFee ?? 0,
        otherCosts: data.otherCosts ?? 0,
      },
    });
    await this.audit.log({
      entity: 'ImportShipment',
      entityId: shipment.id,
      action: 'CREATE',
      userId,
      newValue: shipment,
    });
    return shipment;
  }

  async update(
    id: string,
    data: {
      status?: string;
      shipDate?: string;
      arrivalDate?: string;
      clearanceDate?: string;
      portFees?: number;
      shippingCost?: number;
      clearanceAgentFee?: number;
      otherCosts?: number;
      supplier?: string;
      origin?: string;
    },
    userId: string,
  ) {
    await this.prisma.importShipment.findUniqueOrThrow({ where: { id } });
    const updated = await this.prisma.importShipment.update({
      where: { id },
      data: {
        ...(data.status && { status: data.status as any }),
        ...(data.supplier !== undefined && { supplier: data.supplier }),
        ...(data.origin !== undefined && { origin: data.origin }),
        ...(data.shipDate && { shipDate: new Date(data.shipDate) }),
        ...(data.arrivalDate && { arrivalDate: new Date(data.arrivalDate) }),
        ...(data.clearanceDate && { clearanceDate: new Date(data.clearanceDate) }),
        ...(data.portFees !== undefined && { portFees: data.portFees }),
        ...(data.shippingCost !== undefined && { shippingCost: data.shippingCost }),
        ...(data.clearanceAgentFee !== undefined && { clearanceAgentFee: data.clearanceAgentFee }),
        ...(data.otherCosts !== undefined && { otherCosts: data.otherCosts }),
      },
    });
    await this.audit.log({
      entity: 'ImportShipment',
      entityId: id,
      action: 'UPDATE',
      userId,
      newValue: data,
    });
    return updated;
  }

  async addVehicle(
    shipmentId: string,
    data: { vehicleId: string; customsDuty?: number },
    userId: string,
  ) {
    await this.prisma.importShipment.findUniqueOrThrow({ where: { id: shipmentId } });
    const sv = await this.prisma.importShipmentVehicle.create({
      data: {
        shipmentId,
        vehicleId: data.vehicleId,
        customsDuty: data.customsDuty ?? 0,
      },
    });
    await this.audit.log({
      entity: 'ImportShipmentVehicle',
      entityId: sv.id,
      action: 'ADD_VEHICLE',
      userId,
      newValue: sv,
    });
    return sv;
  }

  async removeVehicle(shipmentId: string, vehicleId: string, userId: string) {
    // vehicleId param = ImportShipmentVehicle.id (the join row)
    const sv = await this.prisma.importShipmentVehicle.findUniqueOrThrow({
      where: { id: vehicleId },
    });
    if (sv.shipmentId !== shipmentId) {
      throw new BadRequestException('Vehicle does not belong to this shipment');
    }
    await this.prisma.importShipmentVehicle.delete({ where: { id: vehicleId } });
    await this.audit.log({
      entity: 'ImportShipmentVehicle',
      entityId: vehicleId,
      action: 'REMOVE_VEHICLE',
      userId,
    });
    return { deleted: true };
  }

  async updateShipmentVehicle(
    shipmentId: string,
    vehicleId: string,
    data: { customsDuty?: number },
    userId: string,
  ) {
    const sv = await this.prisma.importShipmentVehicle.findUniqueOrThrow({
      where: { id: vehicleId },
    });
    if (sv.shipmentId !== shipmentId) {
      throw new BadRequestException('Vehicle does not belong to this shipment');
    }
    const updated = await this.prisma.importShipmentVehicle.update({
      where: { id: vehicleId },
      data: {
        ...(data.customsDuty !== undefined && { customsDuty: data.customsDuty }),
      },
    });
    await this.audit.log({
      entity: 'ImportShipmentVehicle',
      entityId: vehicleId,
      action: 'UPDATE_CUSTOMS',
      userId,
      newValue: data,
    });
    return updated;
  }

  async allocateLandedCosts(shipmentId: string, userId: string) {
    const shipment = await this.prisma.importShipment.findUniqueOrThrow({
      where: { id: shipmentId },
      include: {
        vehicles: {
          include: {
            vehicle: { select: { id: true, price: true, cost: true } },
          },
        },
      },
    });

    const vehicles = shipment.vehicles;
    if (!vehicles.length) {
      throw new BadRequestException('Shipment has no vehicles to allocate costs to');
    }

    const totalSharedCosts =
      Number(shipment.portFees) +
      Number(shipment.shippingCost) +
      Number(shipment.clearanceAgentFee) +
      Number(shipment.otherCosts);

    // ponytail: proportional by vehicle price, fallback to equal split
    const totalPrice = vehicles.reduce(
      (s, v) => s + Number(v.vehicle.price ?? v.vehicle.cost ?? 0),
      0,
    );
    const useEqual = totalPrice === 0;

    await this.prisma.$transaction(async (tx) => {
      for (const sv of vehicles) {
        const vehiclePrice = Number(sv.vehicle.price ?? sv.vehicle.cost ?? 0);
        const allocatedLanded = useEqual
          ? Math.round((totalSharedCosts / vehicles.length) * 100) / 100
          : Math.round((vehiclePrice / totalPrice) * totalSharedCosts * 100) / 100;

        const customsDuty = Number(sv.customsDuty);
        const totalLandedCost = Math.round((customsDuty + allocatedLanded) * 100) / 100;

        await tx.importShipmentVehicle.update({
          where: { id: sv.id },
          data: { allocatedLanded, totalLandedCost },
        });

        // Update linked Vehicle.cost to reflect total landed cost
        await tx.vehicle.update({
          where: { id: sv.vehicleId },
          data: { cost: totalLandedCost },
        });
      }
    });

    await this.audit.log({
      entity: 'ImportShipment',
      entityId: shipmentId,
      action: 'LANDED_COST_ALLOCATED',
      userId,
      newValue: { totalSharedCosts, vehicleCount: vehicles.length },
    });

    return this.findById(shipmentId);
  }
}
