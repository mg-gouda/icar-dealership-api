import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';

const DEFAULT_LOOKUPS: Record<string, string[]> = {
  car_make:     ['Toyota', 'Hyundai', 'Kia', 'Chevrolet', 'Mercedes-Benz', 'BMW', 'Volkswagen', 'Nissan', 'Honda', 'Ford', 'Mitsubishi', 'Jeep', 'Mazda', 'Suzuki', 'Renault'],
  car_color:    ['White', 'Black', 'Silver', 'Gray', 'Red', 'Blue', 'Green', 'Brown', 'Gold', 'Beige', 'Pearl'],
  body_type:    ['Sedan', 'SUV', 'Hatchback', 'Pickup', 'Van', 'Coupe', 'Convertible', 'Wagon'],
  fuel_type:    ['Petrol', 'Diesel', 'Hybrid', 'Electric', 'LPG'],
  transmission:    ['Manual', 'Automatic', 'CVT'],
  gear_type:       ['CVT', 'DCT', 'AMT', 'Torque Converter', 'Dual Clutch', 'Planetary', 'Sequential', 'Tiptronic'],
  vehicle_feature: ['Cruise Control', 'Apple CarPlay', 'Android Auto', 'Reverse Camera', 'Blind Spot Monitor', 'Lane Departure Warning', 'Sunroof', 'Heated Seats', 'Keyless Entry', 'Push Start', 'Navigation', 'Parking Sensors'],
};

@Injectable()
export class LookupItemsService {
  constructor(private prisma: PrismaService) {}

  async getByCategory(companyId: string, category: string) {
    const items = await this.prisma.lookupItem.findMany({
      where: { companyId, category },
      orderBy: [{ sortOrder: 'asc' }, { label: 'asc' }],
    });
    // Lazy seed: first access creates defaults for this company+category
    if (items.length === 0 && DEFAULT_LOOKUPS[category]) {
      const defaults = DEFAULT_LOOKUPS[category].map((v, i) => ({
        companyId,
        category,
        value: v,
        label: v,
        sortOrder: i,
        active: true,
      }));
      await this.prisma.lookupItem.createMany({ data: defaults, skipDuplicates: true });
      return this.prisma.lookupItem.findMany({
        where: { companyId, category },
        orderBy: [{ sortOrder: 'asc' }, { label: 'asc' }],
      });
    }
    return items;
  }

  async getAll(companyId: string) {
    const categories = Object.keys(DEFAULT_LOOKUPS);
    // Ensure all categories seeded
    await Promise.all(categories.map((c) => this.getByCategory(companyId, c)));
    return this.prisma.lookupItem.findMany({
      where: { companyId },
      orderBy: [{ category: 'asc' }, { sortOrder: 'asc' }, { label: 'asc' }],
    });
  }

  async create(companyId: string, data: { category: string; value: string; label: string; sortOrder?: number }, userId: string) {
    const exists = await this.prisma.lookupItem.findUnique({
      where: { companyId_category_value: { companyId, category: data.category, value: data.value } },
    });
    if (exists) throw new ConflictException(`"${data.value}" already exists in ${data.category}`);
    return this.prisma.lookupItem.create({
      data: { companyId, ...data, sortOrder: data.sortOrder ?? 0 },
    });
  }

  async update(id: string, companyId: string, data: { label?: string; value?: string; sortOrder?: number; active?: boolean }, userId: string) {
    const item = await this.prisma.lookupItem.findFirst({ where: { id, companyId } });
    if (!item) throw new NotFoundException('Lookup item not found');
    return this.prisma.lookupItem.update({ where: { id }, data });
  }

  async remove(id: string, companyId: string, userId: string) {
    const item = await this.prisma.lookupItem.findFirst({ where: { id, companyId } });
    if (!item) throw new NotFoundException('Lookup item not found');
    await this.prisma.lookupItem.delete({ where: { id } });
    return { deleted: true };
  }

  async reorder(companyId: string, category: string, ids: string[], userId: string) {
    await Promise.all(
      ids.map((id, i) =>
        this.prisma.lookupItem.updateMany({ where: { id, companyId, category }, data: { sortOrder: i } }),
      ),
    );
    return this.getByCategory(companyId, category);
  }
}
