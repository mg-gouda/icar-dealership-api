import { Controller, Get, Patch, Body, Param, UseGuards, Request } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { LocationsService } from '../locations/locations.service';

@ApiTags('settings')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Controller({ path: 'settings', version: '1' })
export class SettingsController {
  constructor(private locationsSvc: LocationsService) {}

  @Get('company')
  @Roles('ADMIN', 'SUPER_ADMIN', 'MANAGER')
  getCompany(@Request() req: any) {
    return this.locationsSvc.getCompanyProfile(req.user.companyId);
  }

  @Patch('company')
  @Roles('ADMIN', 'SUPER_ADMIN')
  updateCompany(@Request() req: any, @Body() body: Record<string, unknown>) {
    return this.locationsSvc.updateCompanyProfile(req.user.companyId, body as any, req.user.id);
  }

  // ponytail: integrations stub — credentials stored externally, not in DB
  @Get('integrations')
  @Roles('ADMIN', 'SUPER_ADMIN')
  getIntegrations() {
    return { whatsapp: { enabled: false }, email: { enabled: false }, sms: { enabled: false } };
  }

  @Patch('integrations/:service')
  @Roles('ADMIN', 'SUPER_ADMIN')
  updateIntegration(@Param('service') service: string, @Body() body: Record<string, unknown>) {
    return { service, updated: true, ...body };
  }

  @Get('security')
  @Roles('ADMIN', 'SUPER_ADMIN')
  getSecurity() {
    return { passwordPolicy: { minLength: 8, requireUppercase: true, requireNumbers: true }, sessionTimeout: 480, enforce2FA: ['FINANCE', 'ADMIN', 'SUPER_ADMIN'] };
  }

  @Patch('security')
  @Roles('ADMIN', 'SUPER_ADMIN')
  updateSecurity(@Body() body: Record<string, unknown>) {
    return { updated: true, ...body };
  }
}
