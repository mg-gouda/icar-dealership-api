import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  Request,
  ForbiddenException,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { VehiclesService } from './vehicles.service';
import { RolesGuard } from '../common/guards/roles.guard';
import { LocationScopeGuard } from '../common/guards/location-scope.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { LocationScope } from '../common/decorators/location-scope.decorator';
import {
  FieldPolicyEntity,
  assertFieldWriteAccess,
} from '../common/field-policies';
import { CreateVehicleDto } from './dto/create-vehicle.dto';
import { UpdateVehicleDto } from './dto/update-vehicle.dto';

@ApiTags('vehicles')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'), RolesGuard, LocationScopeGuard)
@FieldPolicyEntity('Vehicle')
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
    @Query('accreditedDealerId') accreditedDealerId?: string,
  ) {
    return this.vehiclesService.findAll({
      page: +page,
      limit: +limit,
      locationId,
      status,
      make,
      bodyType,
      minPrice,
      maxPrice,
      accreditedDealerId,
    });
  }

  // ponytail: static routes MUST come before @Get(':id') or NestJS matches id first
  @Get('decode-vin')
  @Roles('SALES_REP', 'MANAGER', 'ADMIN', 'SUPER_ADMIN')
  async decodeVin(@Query('vin') vin: string) {
    if (!vin || vin.length !== 17) return { error: 'VIN must be 17 characters' };
    try {
      const res = await fetch(
        `https://vpic.nhtsa.dot.gov/api/vehicles/DecodeVinValues/${encodeURIComponent(vin)}?format=json`,
        { signal: AbortSignal.timeout(8000) },
      );
      const json = await res.json() as any;
      const r = json?.Results?.[0];
      if (!r) return { vin, decoded: null };
      return {
        vin,
        decoded: {
          make:         r.Make         || null,
          model:        r.Model        || null,
          year:         r.ModelYear    ? +r.ModelYear : null,
          trim:         r.Trim         || null,
          bodyType:     r.BodyClass    || null,
          engineSize:   r.DisplacementL ? `${r.DisplacementL}L` : null,
          cylinders:    r.EngineCylinders || null,
          fuelType:     r.FuelTypePrimary || null,
          transmission: r.TransmissionStyle || null,
          driveType:    r.DriveType    || null,
          doors:        r.Doors        ? +r.Doors : null,
          plant:        r.PlantCountry || null,
          errors:       r.ErrorText    || null,
        },
      };
    } catch {
      return { vin, decoded: null, error: 'NHTSA API unreachable' };
    }
  }

  @Get(':id')
  @Roles('SALES_REP', 'MANAGER', 'FINANCE', 'ADMIN', 'SUPER_ADMIN')
  async findOne(@Param('id') id: string, @Request() req: any) {
    const vehicle = await this.vehiclesService.findById(id);
    if (!['ADMIN', 'SUPER_ADMIN'].includes(req.user.role) && vehicle.locationId !== req.user.locationId) {
      throw new ForbiddenException('Access to this location is not permitted.');
    }
    return vehicle;
  }

  @Get(':id/price-history')
  @Roles('SALES_REP', 'MANAGER', 'ADMIN', 'SUPER_ADMIN', 'FINANCE')
  getPriceHistory(@Param('id') id: string) {
    return this.vehiclesService.getPriceHistory(id);
  }

  @Post()
  @Roles('MANAGER', 'ADMIN', 'SUPER_ADMIN')
  @LocationScope()
  create(@Body() body: CreateVehicleDto) {
    return this.vehiclesService.create(body);
  }

  @Post('bulk-import')
  @Roles('MANAGER', 'ADMIN', 'SUPER_ADMIN')
  bulkImport(@Body() body: { csv: string }) {
    return this.vehiclesService.bulkImport(body.csv);
  }

  @Patch(':id')
  @Roles('MANAGER', 'ADMIN', 'SUPER_ADMIN')
  update(@Param('id') id: string, @Body() body: UpdateVehicleDto, @Request() req: any) {
    assertFieldWriteAccess('Vehicle', body, req.user.role);
    return this.vehiclesService.update(id, body, req.user.name ?? req.user.email);
  }

  @Post(':id/images')
  @Roles('MANAGER', 'ADMIN', 'SUPER_ADMIN')
  addImage(
    @Param('id') id: string,
    @Body() body: { url: string; order?: number },
  ) {
    return this.vehiclesService.addImage(id, body);
  }

  @Patch(':id/images/:imageId')
  @Roles('MANAGER', 'ADMIN', 'SUPER_ADMIN')
  updateImage(
    @Param('id') id: string,
    @Param('imageId') imageId: string,
    @Body() body: { order?: number },
  ) {
    return this.vehiclesService.updateImage(id, imageId, body);
  }

  @Delete(':id/images/:imageId')
  @Roles('MANAGER', 'ADMIN', 'SUPER_ADMIN')
  deleteImage(@Param('id') id: string, @Param('imageId') imageId: string) {
    return this.vehiclesService.deleteImage(id, imageId);
  }

  @Delete(':id')
  @Roles('ADMIN', 'SUPER_ADMIN')
  deleteVehicle(@Param('id') id: string) {
    return this.vehiclesService.deleteVehicle(id);
  }
}
