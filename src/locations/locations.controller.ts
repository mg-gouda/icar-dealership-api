import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Body,
  UseGuards,
  Request,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { LocationsService } from './locations.service';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';

@ApiTags('Locations')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Controller('locations')
export class LocationsController {
  constructor(private svc: LocationsService) {}

  @Get()
  @Roles('SALES_REP', 'MANAGER', 'FINANCE', 'ADMIN', 'SUPER_ADMIN')
  findAll(@Request() req: any) {
    return this.svc.findAll(req.user.companyId);
  }

  @Get(':id')
  @Roles('MANAGER', 'FINANCE', 'ADMIN', 'SUPER_ADMIN')
  findById(@Param('id') id: string) {
    return this.svc.findById(id);
  }

  @Post()
  @Roles('ADMIN', 'SUPER_ADMIN')
  create(@Body() body: any, @Request() req: any) {
    return this.svc.create(
      { ...body, companyId: req.user.companyId },
      req.user.id,
    );
  }

  @Patch(':id')
  @Roles('ADMIN', 'SUPER_ADMIN')
  update(@Param('id') id: string, @Body() body: any, @Request() req: any) {
    return this.svc.update(id, body, req.user.id);
  }

  // ── Company profile (fee bounds config) ─────────────────────────────────

  @Get('company/profile')
  @Roles('ADMIN', 'SUPER_ADMIN')
  getCompanyProfile(@Request() req: any) {
    return this.svc.getCompanyProfile(req.user.companyId);
  }

  @Patch('company/profile')
  @Roles('ADMIN', 'SUPER_ADMIN')
  updateCompanyProfile(@Body() body: any, @Request() req: any) {
    return this.svc.updateCompanyProfile(req.user.companyId, body, req.user.id);
  }

  // UI aliases: /settings/company → /locations/company/profile

  @Get('settings/company')
  @Roles('ADMIN', 'SUPER_ADMIN')
  getSettingsCompany(@Request() req: any) {
    return this.svc.getCompanyProfile(req.user.companyId);
  }

  @Patch('settings/company')
  @Roles('SUPER_ADMIN')
  updateSettingsCompany(@Body() body: any, @Request() req: any) {
    return this.svc.updateCompanyProfile(req.user.companyId, body, req.user.id);
  }

  // ponytail: integrations stub — credentials not yet configured
  @Get('settings/integrations')
  @Roles('ADMIN', 'SUPER_ADMIN')
  getIntegrations() {
    return {
      docusign: { connected: false, config: null },
      vinDecoder: { connected: false, config: null },
      egyptBanksApi: { connected: false, config: null },
    };
  }

  @Patch('settings/integrations/:service')
  @Roles('SUPER_ADMIN')
  updateIntegration(@Param('service') service: string, @Body() body: any) {
    // ponytail: store not implemented — return ack
    return { service, updated: true, connected: body.connected ?? false };
  }

  @Get('settings/security')
  @Roles('ADMIN', 'SUPER_ADMIN')
  getSecuritySettings() {
    return {
      sessionTimeoutMinutes: 480,
      require2fa: ['FINANCE', 'ADMIN', 'SUPER_ADMIN'],
      maxLoginAttempts: 5,
    };
  }

  @Patch('settings/security')
  @Roles('SUPER_ADMIN')
  updateSecuritySettings(@Body() body: any) {
    return { updated: true, ...body };
  }
}
