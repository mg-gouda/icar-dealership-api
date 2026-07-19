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
import { Throttle } from '@nestjs/throttler';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { PublicService } from './public.service';

@ApiTags('Public')
@Controller({ path: 'public', version: '1' })
export class PublicController {
  constructor(private publicService: PublicService) {}

  @Get('company-info')
  @ApiOperation({ summary: 'Public company info (name, logo, phone) for B2C coming-soon / footer' })
  getCompanyInfo() {
    return this.publicService.getCompanyInfo();
  }

  @Get('vehicles')
  @ApiOperation({ summary: 'List available vehicles for B2C site' })
  async listVehicles(@Query() q: any) {
    return this.publicService.listVehicles(q);
  }

  // ponytail: compare must be declared before :id to avoid NestJS swallowing 'compare' as an ID
  @Get('vehicles/compare')
  @ApiOperation({ summary: 'Compare up to 4 vehicles by ID' })
  async compareVehicles(@Query('ids') ids: string) {
    return this.publicService.compareVehicles(ids);
  }

  @Get('vehicles/:id')
  @ApiOperation({ summary: 'Get vehicle detail for B2C site' })
  async getVehicle(@Param('id') id: string) {
    return this.publicService.getVehicle(id);
  }

  @Get('locations')
  @ApiOperation({ summary: 'List company locations for B2C site' })
  async listLocations() {
    return this.publicService.listLocations();
  }

  @Get('deal-status')
  @ApiOperation({
    summary: 'Customer deal status lookup by email + deal ref (B2C -- no auth)',
  })
  async dealStatus(
    @Query('email') email: string,
    @Query('dealRef') dealRef: string,
  ) {
    return this.publicService.dealStatus(email, dealRef);
  }

  // ── Customer Favorites (B2C JWT required) ────────────────────────────────

  @UseGuards(AuthGuard('jwt'))
  @Get('favorites')
  @ApiOperation({ summary: "List customer's saved vehicles (B2C)" })
  async listFavorites(@Request() req: any) {
    return this.publicService.listFavorites(req.user.id);
  }

  @UseGuards(AuthGuard('jwt'))
  @Post('favorites/:vehicleId')
  @ApiOperation({ summary: 'Add vehicle to favorites (B2C)' })
  async addFavorite(
    @Param('vehicleId') vehicleId: string,
    @Request() req: any,
  ) {
    return this.publicService.addFavorite(req.user.id, vehicleId);
  }

  @UseGuards(AuthGuard('jwt'))
  @Delete('favorites/:vehicleId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Remove vehicle from favorites (B2C)' })
  async removeFavorite(
    @Param('vehicleId') vehicleId: string,
    @Request() req: any,
  ) {
    return this.publicService.removeFavorite(req.user.id, vehicleId);
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
    return this.publicService.getAvailability(locationId, date, userId);
  }

  // ponytail: Appointment.customerId is required -- B2C test drive becomes a Lead
  @Post('appointments')
  @ApiOperation({
    summary: 'Request a test drive (B2C, no auth -- creates Lead)',
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
    return this.publicService.bookTestDrive(body);
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
    return this.publicService.createLead(body);
  }

  // ── Customer Account (B2C JWT required) ──────────────────────────────────

  @UseGuards(AuthGuard('jwt'))
  @Get('account/deals')
  @ApiOperation({ summary: "List logged-in customer's deals" })
  async myDeals(@Request() req: any) {
    return this.publicService.myDeals(req.user.id);
  }

  @UseGuards(AuthGuard('jwt'))
  @Get('account/deals/:id')
  @ApiOperation({ summary: 'Get full deal detail for logged-in customer' })
  async myDealDetail(@Param('id') id: string, @Request() req: any) {
    return this.publicService.myDealDetail(id, req.user.id);
  }

  @UseGuards(AuthGuard('jwt'))
  @Get('account/deals/:id/statement')
  @ApiOperation({ summary: 'Get installment statement for a customer deal' })
  async myDealStatement(@Param('id') id: string, @Request() req: any) {
    return this.publicService.myDealStatement(id, req.user.id);
  }

  @UseGuards(AuthGuard('jwt'))
  @Patch('account/profile')
  @ApiOperation({ summary: "Update logged-in customer's profile" })
  async updateProfile(
    @Request() req: any,
    @Body() body: { name?: string; phone?: string },
  ) {
    return this.publicService.updateProfile(req.user.id, body);
  }

  @UseGuards(AuthGuard('jwt'))
  @Get('account/profile')
  @ApiOperation({ summary: 'Get logged-in customer profile' })
  async myProfile(@Request() req: any) {
    return this.publicService.myProfile(req.user.id);
  }

  @UseGuards(AuthGuard('jwt'))
  @Post('account/deals/:id/documents')
  @ApiOperation({ summary: 'Customer uploads a bank financing document' })
  async uploadDealDocument(
    @Param('id') dealId: string,
    @Request() req: any,
    @Body() body: { documentType: string; fileUrl: string },
  ) {
    return this.publicService.uploadDealDocument(dealId, req.user.id, body);
  }

  // ── Public delivery tracker (no auth) ────────────────────────────────────

  @Get('deals/track')
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @ApiOperation({ summary: 'Public deal delivery tracker by tracking token' })
  async trackDeal(@Query('token') token: string) {
    return this.publicService.trackDeal(token);
  }

  // ── Public lead creation (trade-in, alerts) ───────────────────────────

  @Post('vehicles/:id/alerts')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Subscribe to price/availability alerts for a vehicle' })
  async vehicleAlert(
    @Param('id') vehicleId: string,
    @Body() body: { email: string; phone?: string },
  ) {
    return this.publicService.vehicleAlert(vehicleId, body);
  }

  @Post('alerts')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Subscribe to availability alerts for a vehicle spec' })
  async availabilityAlert(
    @Body() body: { vehicleId?: string; make?: string; model?: string; email: string; phone?: string },
  ) {
    return this.publicService.availabilityAlert(body);
  }

  // ── Public user profiles (sales reps) ─────────────────────────────────────

  @Get('users')
  @ApiOperation({ summary: 'List public sales rep profiles' })
  async listPublicUsers() {
    return this.publicService.listPublicUsers();
  }

  @Get('users/:id/profile')
  @ApiOperation({ summary: 'Get a sales rep public profile' })
  async getPublicUserProfile(@Param('id') id: string) {
    return this.publicService.getPublicUserProfile(id);
  }
}
