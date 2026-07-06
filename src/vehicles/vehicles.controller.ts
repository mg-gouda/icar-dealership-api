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
    });
  }

  @Get(':id')
  @Roles('SALES_REP', 'MANAGER', 'FINANCE', 'ADMIN', 'SUPER_ADMIN')
  findOne(@Param('id') id: string) {
    // ponytail: field stripping now handled by FieldPolicyInterceptor
    return this.vehiclesService.findById(id);
  }

  @Post()
  @Roles('MANAGER', 'ADMIN', 'SUPER_ADMIN')
  @LocationScope()
  create(@Body() body: CreateVehicleDto) {
    return this.vehiclesService.create(body);
  }

  @Patch(':id')
  @Roles('MANAGER', 'ADMIN', 'SUPER_ADMIN')
  update(@Param('id') id: string, @Body() body: UpdateVehicleDto, @Request() req: any) {
    assertFieldWriteAccess('Vehicle', body, req.user.role);
    return this.vehiclesService.update(id, body);
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

  @Post('bulk-import')
  @Roles('MANAGER', 'ADMIN', 'SUPER_ADMIN')
  bulkImport(@Body() body: { csv: string }) {
    return this.vehiclesService.bulkImport(body.csv);
  }

  // ponytail: VIN decode stub — returns null until VIN decoder API key is configured
  @Post(':id/decode-vin')
  @Roles('SALES_REP', 'MANAGER', 'ADMIN', 'SUPER_ADMIN')
  decodeVin(@Param('id') id: string, @Body('vin') vin: string) {
    return {
      vin: vin ?? null,
      decoded: null,
      message: 'VIN decoder API key not yet configured',
    };
  }
}
