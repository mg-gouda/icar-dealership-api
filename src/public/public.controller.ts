import {
  Controller,
  Post,
  Delete,
  Patch,
  Body,
  Get,
  Query,
  Param,
  UseGuards,
  Request,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { PrismaService } from '../common/prisma/prisma.service';
import { LeadsService } from '../leads/leads.service';

@ApiTags('Public')
@Controller({ path: 'public', version: '1' })
export class PublicController {
  constructor(
    private prisma: PrismaService,
    private leadsService: LeadsService,
  ) {}

  @Get('vehicles')
  @ApiOperation({ summary: 'List available vehicles for B2C site' })
  async listVehicles(@Query() q: any) {
    const {
      make,
      bodyType,
      condition,
      search,
      minPrice,
      maxPrice,
      limit = 48,
      page = 1,
    } = q;
    const where: any = { status: 'AVAILABLE' };
    if (make) where.make = { contains: make, mode: 'insensitive' };
    if (bodyType) where.bodyType = bodyType;
    if (condition) where.condition = condition;
    if (search)
      where.OR = [
        { make: { contains: search, mode: 'insensitive' } },
        { model: { contains: search, mode: 'insensitive' } },
      ];
    if (minPrice || maxPrice) {
      where.price = {};
      if (minPrice) where.price.gte = Number(minPrice);
      if (maxPrice) where.price.lte = Number(maxPrice);
    }
    const [data, total] = await Promise.all([
      this.prisma.vehicle.findMany({
        where,
        take: Number(limit),
        skip: (Number(page) - 1) * Number(limit),
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
        limit: Number(limit),
        total,
        totalPages: Math.ceil(total / Number(limit)),
      },
    };
  }

  @Get('vehicles/:id')
  @ApiOperation({ summary: 'Get vehicle detail for B2C site' })
  async getVehicle(@Param('id') id: string) {
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

  @Get('locations')
  @ApiOperation({ summary: 'List company locations for B2C site' })
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

  @Get('deal-status')
  @ApiOperation({
    summary: 'Customer deal status lookup by email (B2C — no auth)',
  })
  async dealStatus(@Query('email') email: string, @Query('ref') ref?: string) {
    if (!email) return { deals: [] };
    // Find customer by email, return their deals (status + vehicle + dates only — no financials)
    const user = await this.prisma.user.findUnique({
      where: { email: email.toLowerCase() },
      select: { id: true },
    });
    if (!user) return { deals: [] };

    const where: any = { customerId: user.id };
    if (ref) where.id = { endsWith: ref.slice(-8).toUpperCase() };

    const deals = await this.prisma.deal.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 5,
      select: {
        id: true,
        status: true,
        purchaseMethod: true,
        createdAt: true,
        vehicle: { select: { make: true, model: true, year: true } },
        location: { select: { name: true, phone: true } },
        financeApplication: {
          select: {
            id: true,
            status: true,
            bankApproval: {
              select: {
                approvedAmount: true,
                approvalDate: true,
                approvalReferenceNumber: true,
              },
            },
          },
        },
        installmentPlan: {
          select: {
            id: true,
            principalAmount: true,
            downPayment: true,
            durationMonths: true,
            interestRate: true,
            startDate: true,
            status: true,
            installments: {
              select: {
                dueDate: true,
                status: true,
                totalDue: true,
                paidAmount: true,
              },
              orderBy: { dueDate: 'asc' },
              take: 3,
            },
          },
        },
      },
    });
    return { deals };
  }

  // ── Customer Favorites (B2C JWT required) ────────────────────────────────

  @UseGuards(AuthGuard('jwt'))
  @Get('favorites')
  @ApiOperation({ summary: "List customer's saved vehicles (B2C)" })
  async listFavorites(@Request() req: any) {
    return this.prisma.favorite.findMany({
      where: { customerId: req.user.id },
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

  @UseGuards(AuthGuard('jwt'))
  @Post('favorites/:vehicleId')
  @ApiOperation({ summary: 'Add vehicle to favorites (B2C)' })
  async addFavorite(
    @Param('vehicleId') vehicleId: string,
    @Request() req: any,
  ) {
    return this.prisma.favorite.upsert({
      where: { customerId_vehicleId: { customerId: req.user.id, vehicleId } },
      create: { customerId: req.user.id, vehicleId },
      update: {},
    });
  }

  @UseGuards(AuthGuard('jwt'))
  @Delete('favorites/:vehicleId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Remove vehicle from favorites (B2C)' })
  async removeFavorite(
    @Param('vehicleId') vehicleId: string,
    @Request() req: any,
  ) {
    await this.prisma.favorite.deleteMany({
      where: { customerId: req.user.id, vehicleId },
    });
  }

  @Get('vehicles/compare')
  @ApiOperation({ summary: 'Compare up to 4 vehicles by ID' })
  async compareVehicles(@Query('ids') ids: string) {
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

  @Get('locations/:id/availability')
  @ApiOperation({
    summary:
      'Get available appointment slots for a location (B2C test drive scheduler)',
  })
  async getAvailability(
    @Param('id') locationId: string,
    @Query('date') date: string,
    @Query('userId') userId?: string,
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

  // ponytail: Appointment.customerId is required → B2C test drive becomes a Lead
  // Admin converts Lead → Appointment after calling customer back
  @Post('appointments')
  @ApiOperation({
    summary: 'Request a test drive (B2C, no auth — creates Lead)',
  })
  async bookTestDrive(
    @Body()
    body: {
      locationId: string;
      vehicleId?: string;
      name: string;
      phone?: string;
      email?: string;
      preferredDate?: string;
      notes?: string;
    },
  ) {
    const locationId =
      body.locationId ??
      (
        await this.prisma.location.findFirst({
          orderBy: { createdAt: 'asc' },
          select: { id: true },
        })
      )?.id;
    if (!locationId) throw new Error('No location configured');
    return this.leadsService.create(
      {
        locationId,
        name: body.name,
        phone: body.phone,
        email: body.email,
        source: 'TEST_DRIVE',
        vehicleId: body.vehicleId ?? undefined,
        notes: body.preferredDate
          ? `Preferred date: ${body.preferredDate}. ${body.notes ?? ''}`.trim()
          : body.notes,
      },
      'system',
    );
  }

  @Post('leads')
  @ApiOperation({
    summary: 'Submit a lead from the B2C website (no auth required)',
  })
  async createLead(
    @Body()
    body: {
      name: string;
      phone?: string;
      email?: string;
      source?: string;
      vehicleId?: string;
      locationId?: string;
      notes?: string;
    },
  ) {
    // Resolve location: use provided locationId or fall back to first active location
    const locationId =
      body.locationId ??
      (
        await this.prisma.location.findFirst({
          orderBy: { createdAt: 'asc' },
          select: { id: true },
        })
      )?.id;
    if (!locationId) throw new Error('No location configured');
    // ponytail: 'system' sentinel userId — public endpoint has no auth user
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

  // ── Customer Account (B2C JWT required) ──────────────────────────────────

  @UseGuards(AuthGuard('jwt'))
  @Get('account/deals')
  @ApiOperation({ summary: "List logged-in customer's deals" })
  async myDeals(@Request() req: any) {
    return this.prisma.deal.findMany({
      where: { customerId: req.user.id },
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

  @UseGuards(AuthGuard('jwt'))
  @Get('account/deals/:id')
  @ApiOperation({ summary: 'Get full deal detail for logged-in customer' })
  async myDealDetail(@Param('id') id: string, @Request() req: any) {
    const deal = await this.prisma.deal.findFirstOrThrow({
      where: { id, customerId: req.user.id },
      include: {
        vehicle: {
          select: {
            id: true,
            make: true,
            model: true,
            year: true,
            vin: true,
            images: { orderBy: { order: 'asc' }, take: 3 },
          },
        },
        installmentPlan: {
          include: { installments: { orderBy: { dueDate: 'asc' } } },
        },
        financeApplication: {
          include: {
            bankApproval: true,
            requiredDocuments: true,
          },
        },
        invoices: { where: { type: 'CUSTOMER_INVOICE' }, take: 1 },
      },
    });
    return deal;
  }

  @UseGuards(AuthGuard('jwt'))
  @Patch('account/profile')
  @ApiOperation({ summary: "Update logged-in customer's profile" })
  async updateProfile(
    @Request() req: any,
    @Body() body: { name?: string; phone?: string },
  ) {
    return this.prisma.user.update({
      where: { id: req.user.id },
      data: { name: body.name, phone: body.phone },
      select: { id: true, name: true, email: true, phone: true },
    });
  }

  @UseGuards(AuthGuard('jwt'))
  @Get('account/profile')
  @ApiOperation({ summary: 'Get logged-in customer profile' })
  async myProfile(@Request() req: any) {
    return this.prisma.user.findUniqueOrThrow({
      where: { id: req.user.id },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        createdAt: true,
      },
    });
  }

  @UseGuards(AuthGuard('jwt'))
  @Post('account/deals/:id/documents')
  @ApiOperation({ summary: 'Customer uploads a bank financing document' })
  async uploadDealDocument(
    @Param('id') dealId: string,
    @Request() req: any,
    @Body() body: { documentType: string; fileUrl: string },
  ) {
    const deal = await this.prisma.deal.findFirstOrThrow({
      where: { id: dealId, customerId: req.user.id },
      select: { financeApplication: { select: { id: true } } },
    });
    if (!deal.financeApplication)
      throw new Error('No finance application on this deal');
    // ponytail: no unique constraint on financeApplicationId+documentType → findFirst+update or create
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
}
