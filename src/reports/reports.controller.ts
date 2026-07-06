import {
  Controller,
  Get,
  Query,
  UseGuards,
  Request,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { RolesGuard } from '../common/guards/roles.guard';
import { LocationScopeGuard } from '../common/guards/location-scope.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { LocationScope } from '../common/decorators/location-scope.decorator';
import { OperationalReportsService } from './reports.service';

@ApiTags('Operational Reports')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'), RolesGuard, LocationScopeGuard)
@Controller('reports')
export class OperationalReportsController {
  constructor(private svc: OperationalReportsService) {}

  @Get('sales-pipeline')
  @LocationScope()
  @Roles('MANAGER', 'FINANCE', 'ADMIN', 'SUPER_ADMIN')
  salesPipeline(@Request() req: any, @Query() q: any) {
    return this.svc.salesPipeline({
      locationId: this.resolveLocation(req, q),
      dateFrom: q.dateFrom,
      dateTo: q.dateTo,
    });
  }

  @Get('inventory-aging')
  @LocationScope()
  @Roles('MANAGER', 'FINANCE', 'ADMIN', 'SUPER_ADMIN')
  inventoryAging(@Request() req: any, @Query() q: any) {
    return this.svc.inventoryAging(this.resolveLocation(req, q));
  }

  @Get('lead-conversion')
  @LocationScope()
  @Roles('MANAGER', 'FINANCE', 'ADMIN', 'SUPER_ADMIN')
  leadConversion(@Request() req: any, @Query() q: any) {
    return this.svc.leadConversion({
      locationId: this.resolveLocation(req, q),
      dateFrom: q.dateFrom,
      dateTo: q.dateTo,
    });
  }

  @Get('appointment-analytics')
  @LocationScope()
  @Roles('MANAGER', 'FINANCE', 'ADMIN', 'SUPER_ADMIN')
  appointmentAnalytics(@Request() req: any, @Query() q: any) {
    return this.svc.appointmentAnalytics({
      locationId: this.resolveLocation(req, q),
      dateFrom: q.dateFrom,
      dateTo: q.dateTo,
    });
  }

  // ponytail: same pattern as DealsController — ADMIN/SUPER_ADMIN can query any location
  private resolveLocation(req: any, q: any): string | undefined {
    const { role, locationId: userLoc } = req.user;
    if (['ADMIN', 'SUPER_ADMIN'].includes(role)) return q.locationId;
    return q.locationId ?? userLoc;
  }
}
