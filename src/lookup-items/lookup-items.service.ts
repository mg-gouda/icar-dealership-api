import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';

type DefaultItem = { en: string; ar: string };
const DEFAULT_LOOKUPS: Record<string, DefaultItem[]> = {
  car_color: [
    { en: 'White',  ar: 'أبيض' }, { en: 'Black',  ar: 'أسود' }, { en: 'Silver', ar: 'فضي' },
    { en: 'Gray',   ar: 'رمادي' }, { en: 'Red',    ar: 'أحمر' }, { en: 'Blue',   ar: 'أزرق' },
    { en: 'Green',  ar: 'أخضر' }, { en: 'Brown',  ar: 'بني' },  { en: 'Gold',   ar: 'ذهبي' },
    { en: 'Beige',  ar: 'بيج' },  { en: 'Pearl',  ar: 'لؤلؤي' },
  ],
  body_type: [
    { en: 'Sedan',      ar: 'سيدان' },   { en: 'SUV',         ar: 'دفع رباعي' },
    { en: 'Hatchback',  ar: 'هاتشباك' }, { en: 'Pickup',      ar: 'بيك أب' },
    { en: 'Van',        ar: 'فان' },      { en: 'Coupe',       ar: 'كوبيه' },
    { en: 'Convertible',ar: 'مكشوفة' },  { en: 'Wagon',       ar: 'ستيشن واجن' },
  ],
  fuel_type: [
    { en: 'Petrol',  ar: 'بنزين' }, { en: 'Diesel', ar: 'ديزل' },
    { en: 'Hybrid',  ar: 'هجين' },  { en: 'Electric', ar: 'كهربائي' },
    { en: 'LPG',     ar: 'غاز' },
  ],
  transmission: [
    { en: 'Manual',    ar: 'يدوي' }, { en: 'Automatic', ar: 'أوتوماتيك' },
    { en: 'CVT',       ar: 'CVT' },
  ],
  gear_type: [
    { en: 'CVT',              ar: 'CVT' },             { en: 'DCT',           ar: 'DCT' },
    { en: 'AMT',              ar: 'AMT' },             { en: 'Torque Converter', ar: 'محول عزم' },
    { en: 'Dual Clutch',      ar: 'قابض مزدوج' },     { en: 'Planetary',     ar: 'كوكبي' },
    { en: 'Sequential',       ar: 'تسلسلي' },          { en: 'Tiptronic',     ar: 'تيبترونيك' },
  ],
  vehicle_feature: [
    { en: 'Cruise Control',       ar: 'مثبت السرعة' },      { en: 'Apple CarPlay',         ar: 'أبل كار بلاي' },
    { en: 'Android Auto',         ar: 'أندرويد أوتو' },     { en: 'Reverse Camera',        ar: 'كاميرا خلفية' },
    { en: 'Blind Spot Monitor',   ar: 'مراقب النقطة العمياء' }, { en: 'Lane Departure Warning', ar: 'تحذير الانحراف عن المسار' },
    { en: 'Sunroof',              ar: 'فتحة سقف' },          { en: 'Heated Seats',          ar: 'مقاعد مدفأة' },
    { en: 'Keyless Entry',        ar: 'دخول بدون مفتاح' },   { en: 'Push Start',            ar: 'تشغيل بلمسة' },
    { en: 'Navigation',           ar: 'نظام ملاحة' },        { en: 'Parking Sensors',       ar: 'حساسات ركن' },
  ],
};

@Injectable()
export class LookupItemsService {
  constructor(private prisma: PrismaService) {}

  async getByCategory(companyId: string, category: string) {
    const items = await this.prisma.lookupItem.findMany({
      where: { companyId, category },
      orderBy: [{ sortOrder: 'asc' }, { label: 'asc' }],
    });
    if (items.length === 0 && DEFAULT_LOOKUPS[category]) {
      const defaults = DEFAULT_LOOKUPS[category].map((d, i) => ({
        companyId, category,
        value: d.en, label: d.en, labelAr: d.ar,
        sortOrder: i, active: true,
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
    await Promise.all(Object.keys(DEFAULT_LOOKUPS).map((c) => this.getByCategory(companyId, c)));
    return this.prisma.lookupItem.findMany({
      where: { companyId },
      orderBy: [{ category: 'asc' }, { sortOrder: 'asc' }, { label: 'asc' }],
    });
  }

  async create(companyId: string, data: { category: string; value: string; label: string; labelAr?: string; sortOrder?: number }, userId: string) {
    const exists = await this.prisma.lookupItem.findUnique({
      where: { companyId_category_value: { companyId, category: data.category, value: data.value } },
    });
    if (exists) throw new ConflictException(`"${data.value}" already exists in ${data.category}`);
    return this.prisma.lookupItem.create({
      data: { companyId, ...data, sortOrder: data.sortOrder ?? 0 },
    });
  }

  async update(id: string, companyId: string, data: { label?: string; labelAr?: string; value?: string; sortOrder?: number; active?: boolean }, userId: string) {
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
