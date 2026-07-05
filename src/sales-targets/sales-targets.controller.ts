import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Body,
  Query,
  UseGuards,
  Request,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { SalesTargetsService } from './sales-targets.service';
import { RolesGuard } from '../common/guards/roles.guard';
import { LocationScopeGuard } from '../common/guards/location-scope.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { LocationScope } from '../common/decorators/location-scope.decorator';

@ApiTags('Sales Targets')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'), RolesGuard, LocationScopeGuard)
@Controller('sales-targets')
export class SalesTargetsController {
  constructor(private svc: SalesTargetsService) {}

  @Get()
  @LocationScope()
  @Roles('MANAGER', 'ADMIN', 'SUPER_ADMIN')
  @ApiOperation({ summary: 'List sales targets by location/period' })
  findAll(@Query() q: any, @Request() req: any) {
    return this.svc.findAll({
      ...q,
      companyId: req.user.companyId ?? 'company-001',
    });
  }

  @Post()
  @Roles('MANAGER', 'ADMIN', 'SUPER_ADMIN')
  @ApiOperation({ summary: 'Create or upsert a sales target for user+location+period' })
  create(@Body() body: any, @Request() req: any) {
    return this.svc.upsert({
      userId: body.userId,
      locationId: body.locationId,
      period: body.period,
      targetUnits: body.targetUnits,
      targetRevenue: body.targetRevenue,
      companyId: req.user.companyId ?? 'company-001',
    });
  }

  @Patch(':id')
  @Roles('MANAGER', 'ADMIN', 'SUPER_ADMIN')
  @ApiOperation({ summary: 'Update target values' })
  update(@Param('id') id: string, @Body() body: any) {
    return this.svc.update(id, {
      targetUnits: body.targetUnits,
      targetRevenue: body.targetRevenue,
    });
  }

  @Get('attainment')
  @LocationScope()
  @Roles('MANAGER', 'ADMIN', 'SUPER_ADMIN')
  @ApiOperation({ summary: 'Compare targets vs actual deals for a period' })
  attainment(@Query() q: any, @Request() req: any) {
    return this.svc.getAttainment({
      locationId: q.locationId,
      period: q.period,
      companyId: req.user.companyId ?? 'company-001',
    });
  }
}
