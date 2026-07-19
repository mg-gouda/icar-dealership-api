import {
  Injectable,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';
import { LeadsService } from '../leads/leads.service';
import { DealsService } from '../deals/deals.service';
import { buildVehicleWhereClause } from '../common/helpers/vehicle-query.helper';

@Injectable()
export class PublicService {
  constructor(
    private prisma: PrismaService,
    private leadsService: LeadsService,
    private dealsService: DealsService,
  ) {}

  async getCompanyInfo() {
    const company = await this.prisma.company.findFirst({
      select: { name: true, logoUrl: true, faviconUrl: true, phone: true },
    });
    return company ?? { name: '', logoUrl: null, faviconUrl: null, phone: null };
  }

  // ── Public Vehicles ─────────────────────────────────────────────────────

  async listVehicles(q: {
    make?: string;
    bodyType?: string;
    condition?: string;
    search?: string;
    minPrice?: number;
    maxPrice?: number;
    limit?: number;
    page?: number;
  }) {
    const { limit, page = 1 } = q;
    // ponytail: cap public listing to 100 rows max
    const take = Math.min(Number(limit) || 24, 100);
    const where = {
      ...buildVehicleWhereClause({
        status: 'AVAILABLE',
        make: q.make,
        bodyType: q.bodyType,
        condition: q.condition,
        search: q.search,
        minPrice: q.minPrice,
        maxPrice: q.maxPrice,
      }),
    };

    const [data, total] = await Promise.all([
      this.prisma.vehicle.findMany({
        where,
        take,
        skip: (Number(page) - 1) * take,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          make: true,
          model: true,
          year: true,
          vin: true,
          price: true,
          bodyType: true,
          color: true,
          mileage: true,
          fuelType: true,
          transmission: true,
          status: true,
          images: { orderBy: { order: 'asc' }, take: 1, select: { url: true } },
          location: { select: { name: true, city: true } },
        },
      }),
      this.prisma.vehicle.count({ where }),
    ]);
    return {
      data,
      meta: {
        page: Number(page),
        limit: take,
        total,
        totalPages: Math.ceil(total / take),
      },
    };
  }

  async getVehicle(id: string) {
    return this.prisma.vehicle.findUniqueOrThrow({
      where: { id },
      select: {
        id: true,
        make: true,
        model: true,
        trim: true,
        year: true,
        vin: true,
        price: true,
        bodyType: true,
        color: true,
        mileage: true,
        fuelType: true,
        transmission: true,
        description: true,
        status: true,
        images: { orderBy: { order: 'asc' }, select: { url: true } },
        features: { select: { feature: true } },
        location: { select: { name: true, city: true, phone: true } },
      },
    });
  }

  async compareVehicles(ids: string) {
    if (!ids) return [];
    const idList = ids
      .split(',')
      .slice(0, 4)
      .map((s) => s.trim())
      .filter(Boolean);
    return this.prisma.vehicle.findMany({
      where: { id: { in: idList }, status: 'AVAILABLE' },
      include: {
        images: { orderBy: { order: 'asc' }, take: 1 },
        location: { select: { name: true, city: true } },
        features: { select: { feature: true } },
      },
    });
  }

  // ── Locations ───────────────────────────────────────────────────────────

  async listLocations() {
    return this.prisma.location.findMany({
      select: {
        id: true,
        name: true,
        address: true,
        city: true,
        phone: true,
        businessHours: true,
      },
      orderBy: { name: 'asc' },
    });
  }

  async getAvailability(
    locationId: string,
    date: string,
    userId?: string,
  ) {
    const targetDate = new Date(date);
    const dayOfWeek = targetDate.getDay(); // 0=Sun

    // Get working hours for the user (or any SALES_REP at this location)
    const user = userId
      ? await this.prisma.user.findUnique({
          where: { id: userId },
          include: { workingHours: true },
        })
      : await this.prisma.user.findFirst({
          where: { locationId, role: 'SALES_REP', isActive: true },
          include: { workingHours: true },
        });

    const hours = user?.workingHours?.find(
      (h: any) => h.dayOfWeek === dayOfWeek,
    );
    if (!hours) return { available: false, slots: [] };

    // Generate 30-min slots within working hours
    const [startH, startM] = hours.startTime.split(':').map(Number);
    const [endH, endM] = hours.endTime.split(':').map(Number);
    const startMins = startH * 60 + startM;
    const endMins = endH * 60 + endM;

    // Fetch booked slots
    const startOfDay = new Date(targetDate);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(targetDate);
    endOfDay.setHours(23, 59, 59, 999);
    const booked = await this.prisma.appointment.findMany({
      where: {
        locationId,
        scheduledAt: { gte: startOfDay, lte: endOfDay },
        status: { in: ['SCHEDULED', 'COMPLETED'] },
      },
      select: { scheduledAt: true },
    });
    const bookedMins = new Set(
      booked.map((a: any) => {
        const d = new Date(a.scheduledAt);
        return d.getHours() * 60 + d.getMinutes();
      }),
    );

    const slots: string[] = [];
    for (let m = startMins; m < endMins - 29; m += 30) {
      if (!bookedMins.has(m)) {
        const h = String(Math.floor(m / 60)).padStart(2, '0');
        const min = String(m % 60).padStart(2, '0');
        slots.push(`${h}:${min}`);
      }
    }

    return { available: slots.length > 0, date, slots };
  }

  // ── Deal Status / Tracking ──────────────────────────────────────────────

  async dealStatus(email: string, dealRef: string) {
    if (!email || !dealRef) {
      throw new BadRequestException('email and dealRef are required');
    }
    // ponytail: single query joining customer email + deal id suffix -- 404 hides existence
    const deal = await this.prisma.deal.findFirst({
      where: {
        customer: { email: email.toLowerCase() },
        id: { endsWith: dealRef.slice(-8).toUpperCase() },
      },
      select: {
        id: true,
        status: true,
        purchaseMethod: true,
        createdAt: true,
        vehicle: { select: { make: true, model: true, year: true } },
        location: { select: { name: true, phone: true } },
      },
    });
    if (!deal) throw new NotFoundException('Deal not found');
    return { deal };
  }

  async trackDeal(token: string) {
    if (!token) return { found: false };

    const deal = await this.prisma.deal.findUnique({
      where: { trackingToken: token },
      select: {
        id: true,
        status: true,
        purchaseMethod: true,
        createdAt: true,
        vehicle: { select: { make: true, model: true, year: true, color: true } },
        customer: { select: { name: true } },
        salesRep: { select: { name: true, phone: true } },
        location: { select: { name: true, phone: true } },
        serviceOrders: {
          where: { type: 'PDI' },
          select: { status: true, completedAt: true },
          take: 1,
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!deal) return { found: false };

    // Build status timeline from deal state
    const pdiOrder = deal.serviceOrders?.[0];
    const steps = [
      { label: 'Deal Signed', done: true, date: deal.createdAt },
      {
        label: 'Pre-Delivery Inspection',
        done: pdiOrder?.status === 'COMPLETED' || deal.status === 'FINALIZED',
        date: pdiOrder?.completedAt ?? null,
        current: pdiOrder && pdiOrder.status !== 'COMPLETED',
      },
      {
        label: 'Ready for Pickup',
        done: deal.status === 'FINALIZED',
        current: deal.status === 'FINALIZED' && (!pdiOrder || pdiOrder.status === 'COMPLETED'),
      },
      { label: 'Delivered', done: false },
    ];

    return {
      found: true,
      vehicle: deal.vehicle,
      customer: { name: deal.customer.name },
      salesRep: deal.salesRep,
      location: deal.location,
      status: deal.status,
      steps,
    };
  }

  // ── Favorites (JWT-protected) ───────────────────────────────────────────

  async listFavorites(customerId: string) {
    return this.prisma.favorite.findMany({
      where: { customerId },
      include: {
        vehicle: {
          select: {
            id: true,
            make: true,
            model: true,
            year: true,
            price: true,
            images: { take: 1, select: { url: true } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async addFavorite(customerId: string, vehicleId: string) {
    return this.prisma.favorite.upsert({
      where: { customerId_vehicleId: { customerId, vehicleId } },
      create: { customerId, vehicleId },
      update: {},
    });
  }

  async removeFavorite(customerId: string, vehicleId: string) {
    await this.prisma.favorite.deleteMany({
      where: { customerId, vehicleId },
    });
  }

  // ── Lead / Test-Drive creation (public, no auth) ────────────────────────

  async bookTestDrive(body: {
    locationId: string;
    vehicleId?: string;
    name: string;
    phone?: string;
    email?: string;
    preferredDate?: string;
    notes?: string;
  }) {
    const locationId = await this.resolveLocationId(body.locationId);
    // ponytail: Appointment.customerId is required -- B2C test drive becomes a Lead
    return this.leadsService.create(
      {
        locationId,
        name: body.name,
        phone: body.phone,
        email: body.email,
        source: 'OTHER',
        vehicleId: body.vehicleId ?? undefined,
        notes: body.preferredDate
          ? `Preferred date: ${body.preferredDate}. ${body.notes ?? ''}`.trim()
          : body.notes,
      },
      'system',
    );
  }

  async createLead(body: {
    name: string;
    phone?: string;
    email?: string;
    source?: string;
    vehicleId?: string;
    locationId?: string;
    notes?: string;
  }) {
    const locationId = await this.resolveLocationId(body.locationId);
    // ponytail: 'system' sentinel userId -- public endpoint has no auth user
    return this.leadsService.create(
      {
        locationId,
        name: body.name,
        phone: body.phone,
        email: body.email,
        source: body.source ?? 'WEBSITE',
        vehicleId: body.vehicleId || undefined,
        notes: body.notes,
      },
      'system',
    );
  }

  // ── Alerts ──────────────────────────────────────────────────────────────

  async vehicleAlert(vehicleId: string, body: { email: string; phone?: string }) {
    // ponytail: store as a lead with PRICE_ALERT source until a dedicated alert table is added
    const vehicle = await this.prisma.vehicle.findUnique({
      where: { id: vehicleId },
      select: { make: true, model: true, year: true },
    });
    const note = vehicle
      ? `Price alert: ${vehicle.year} ${vehicle.make} ${vehicle.model}`
      : `Price alert: vehicle ${vehicleId}`;
    const loc = await this.prisma.location.findFirst({
      orderBy: { createdAt: 'asc' },
      select: { id: true },
    });
    if (!loc) return { ok: false };
    await this.prisma.lead.create({
      data: {
        name: body.email,
        email: body.email,
        phone: body.phone,
        source: 'WEBSITE' as any,
        notes: note,
        vehicleId,
        status: 'NEW',
        locationId: loc.id,
      },
    });
    return { ok: true };
  }

  async availabilityAlert(body: {
    vehicleId?: string;
    make?: string;
    model?: string;
    email: string;
    phone?: string;
  }) {
    const note =
      `Availability alert: ${body.make ?? ''} ${body.model ?? ''} (vehicle: ${body.vehicleId ?? 'any'})`.trim();
    const loc = await this.prisma.location.findFirst({
      orderBy: { createdAt: 'asc' },
      select: { id: true },
    });
    if (!loc) return { ok: false };
    await this.prisma.lead.create({
      data: {
        name: body.email,
        email: body.email,
        phone: body.phone,
        source: 'WEBSITE' as any,
        notes: note,
        vehicleId: body.vehicleId,
        status: 'NEW',
        locationId: loc.id,
      },
    });
    return { ok: true };
  }

  // ── Customer Account (JWT-protected) ────────────────────────────────────

  async myDeals(customerId: string) {
    return this.prisma.deal.findMany({
      where: { customerId },
      include: {
        vehicle: {
          select: {
            id: true,
            make: true,
            model: true,
            year: true,
            images: { orderBy: { order: 'asc' }, take: 1 },
          },
        },
        installmentPlan: {
          select: {
            id: true,
            status: true,
            totalPayable: true,
            durationMonths: true,
            installments: {
              where: { status: { in: ['PENDING', 'OVERDUE'] } },
              orderBy: { dueDate: 'asc' },
              take: 1,
              select: { dueDate: true, totalDue: true, status: true },
            },
          },
        },
        financeApplication: {
          select: {
            id: true,
            bankFinancingStatus: true,
            rejectionReason: true,
            bankApproval: {
              select: {
                approvedAmount: true,
                approvalDate: true,
                approvalReferenceNumber: true,
              },
            },
            requiredDocuments: {
              select: {
                id: true,
                documentType: true,
                status: true,
                fileUrl: true,
              },
            },
          },
        },
        invoices: {
          where: { type: 'CUSTOMER_INVOICE' },
          select: { id: true, amountTotal: true, status: true },
          take: 1,
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async myDealDetail(dealId: string, customerId: string) {
    // ponytail: explicit select -- strip Vehicle.cost, commissions, BankApproval internal notes
    return this.prisma.deal.findFirstOrThrow({
      where: { id: dealId, customerId },
      select: {
        id: true,
        status: true,
        purchaseMethod: true,
        salePrice: true,
        adminFee: true,
        insuranceFee: true,
        tradeInValue: true,
        tradeInMake: true,
        tradeInModel: true,
        tradeInYear: true,
        createdAt: true,
        updatedAt: true,
        vehicle: {
          select: {
            id: true,
            make: true,
            model: true,
            year: true,
            vin: true,
            color: true,
            images: { orderBy: { order: 'asc' }, take: 3, select: { url: true } },
          },
        },
        installmentPlan: {
          select: {
            id: true,
            status: true,
            principalAmount: true,
            downPayment: true,
            interestRate: true,
            durationMonths: true,
            totalPayable: true,
            monthlyInstallment: true,
            startDate: true,
            installments: {
              orderBy: { dueDate: 'asc' as const },
              select: {
                id: true,
                installmentNumber: true,
                dueDate: true,
                principalPortion: true,
                interestPortion: true,
                totalDue: true,
                status: true,
                paidAmount: true,
                paidDate: true,
              },
            },
          },
        },
        financeApplication: {
          select: {
            id: true,
            status: true,
            applicantInfo: true,
            bankName: true,
            bankBranch: true,
            bankFinancingStatus: true,
            rejectionReason: true,
            bankApproval: {
              select: {
                approvedAmount: true,
                approvalDate: true,
                approvalReferenceNumber: true,
              },
            },
            requiredDocuments: {
              select: {
                id: true,
                documentType: true,
                status: true,
                fileUrl: true,
              },
            },
          },
        },
        invoices: {
          where: { type: 'CUSTOMER_INVOICE' },
          take: 1,
          select: { id: true, amountTotal: true, status: true },
        },
        location: { select: { name: true, phone: true } },
        salesRep: { select: { name: true, phone: true } },
      },
    });
  }

  async myDealStatement(dealId: string, customerId: string) {
    await this.prisma.deal.findFirstOrThrow({
      where: { id: dealId, customerId },
    });
    return this.dealsService.getStatement(dealId);
  }

  async uploadDealDocument(
    dealId: string,
    customerId: string,
    body: { documentType: string; fileUrl: string },
  ) {
    const deal = await this.prisma.deal.findFirstOrThrow({
      where: { id: dealId, customerId },
      select: { financeApplication: { select: { id: true } } },
    });
    if (!deal.financeApplication)
      throw new BadRequestException('No finance application on this deal');
    // ponytail: no unique constraint on financeApplicationId+documentType -- findFirst+update or create
    const existing = await this.prisma.bankFinancingDocument.findFirst({
      where: {
        financeApplicationId: deal.financeApplication.id,
        documentType: body.documentType,
      },
    });
    if (existing) {
      return this.prisma.bankFinancingDocument.update({
        where: { id: existing.id },
        data: {
          fileUrl: body.fileUrl,
          status: 'SUBMITTED',
          uploadedAt: new Date(),
        },
      });
    }
    return this.prisma.bankFinancingDocument.create({
      data: {
        financeApplicationId: deal.financeApplication.id,
        documentType: body.documentType,
        fileUrl: body.fileUrl,
        status: 'SUBMITTED',
        uploadedAt: new Date(),
      },
    });
  }

  // ── Customer Profile (JWT-protected) ────────────────────────────────────

  async updateProfile(
    userId: string,
    body: { name?: string; phone?: string },
  ) {
    return this.prisma.user.update({
      where: { id: userId },
      data: { name: body.name, phone: body.phone },
      select: { id: true, name: true, email: true, phone: true },
    });
  }

  async myProfile(userId: string) {
    return this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        createdAt: true,
      },
    });
  }

  // ── Public Users ────────────────────────────────────────────────────────

  async listPublicUsers() {
    // ponytail: hardcoded SALES_REP -- never expose ADMIN/FINANCE/MANAGER on public endpoint
    return this.prisma.user.findMany({
      where: { role: 'SALES_REP', isActive: true },
      select: {
        id: true,
        name: true,
        role: true,
        locationId: true,
        location: { select: { name: true } },
      },
      take: 50,
      orderBy: { name: 'asc' },
    });
  }

  async getPublicUserProfile(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id, role: 'SALES_REP' },
      select: {
        id: true,
        name: true,
        role: true,
        locationId: true,
        location: { select: { name: true, city: true } },
      },
    });
    if (!user) return null;
    const dealsThisMonth = await this.prisma.deal.count({
      where: {
        salesRepId: id,
        status: 'FINALIZED',
        createdAt: {
          gte: new Date(
            new Date().getFullYear(),
            new Date().getMonth(),
            1,
          ),
        },
      },
    });
    return { ...user, dealsThisMonth };
  }

  // ── Private helpers ─────────────────────────────────────────────────────

  private async resolveLocationId(
    locationId?: string,
  ): Promise<string> {
    if (locationId) return locationId;
    const loc = await this.prisma.location.findFirst({
      orderBy: { createdAt: 'asc' },
      select: { id: true },
    });
    if (!loc) throw new BadRequestException('No location configured');
    return loc.id;
  }
}
