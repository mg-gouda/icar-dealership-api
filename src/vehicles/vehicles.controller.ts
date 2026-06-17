import { Controller, Get, Post, Patch, Body, Param, Query, UseGuards, Request } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { VehiclesService } from './vehicles.service';
import { RolesGuard } from '../common/guards/roles.guard';
import { LocationScopeGuard } from '../common/guards/location-scope.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { LocationScope } from '../common/decorators/location-scope.decorator';

@ApiTags('vehicles')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'), RolesGuard, LocationScopeGuard)
@Controller({ path: 'vehicles', version: '1' })
export class VehiclesController {
  constructor(private vehiclesService: VehiclesService) {}

  @Get()
  @Roles('SALES_REP', 'MANAGER', 'FINANCE', 'ADMIN', 'SUPER_ADMIN')
  @LocationScope()
  findAll(
    @Query('page') page = 1,
    @Query('limit') limit = 20,
    @Query('locationId') locationId?: string,
    @Query('status') status?: string,
    @Query('make') make?: string,
    @Query('bodyType') bodyType?: string,
    @Query('minPrice') minPrice?: number,
    @Query('maxPrice') maxPrice?: number,
  ) {
    return this.vehiclesService.findAll({ page: +page, limit: +limit, locationId, status, make, bodyType, minPrice, maxPrice });
  }

  @Get(':id')
  @Roles('SALES_REP', 'MANAGER', 'FINANCE', 'ADMIN', 'SUPER_ADMIN')
  findOne(@Param('id') id: string, @Request() req: any) {
    const isPrivileged = ['MANAGER', 'FINANCE', 'ADMIN', 'SUPER_ADMIN'].includes(req.user?.role);
    return this.vehiclesService.findById(id, isPrivileged);
  }

  @Post()
  @Roles('MANAGER', 'ADMIN', 'SUPER_ADMIN')
  @LocationScope()
  create(@Body() body: any) {
    return this.vehiclesService.create(body);
  }

  @Patch(':id')
  @Roles('MANAGER', 'ADMIN', 'SUPER_ADMIN')
  update(@Param('id') id: string, @Body() body: any) {
    return this.vehiclesService.update(id, body);
  }
}
