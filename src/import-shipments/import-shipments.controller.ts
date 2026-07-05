import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  Query,
  UseGuards,
  Request,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ImportShipmentsService } from './import-shipments.service';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';

@ApiTags('Import Shipments')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Controller('import-shipments')
export class ImportShipmentsController {
  constructor(private svc: ImportShipmentsService) {}

  @Get()
  @Roles('MANAGER', 'ADMIN', 'SUPER_ADMIN')
  findAll(@Query() q: any) {
    return this.svc.findAll(q);
  }

  @Get(':id')
  @Roles('MANAGER', 'ADMIN', 'SUPER_ADMIN')
  findById(@Param('id') id: string) {
    return this.svc.findById(id);
  }

  @Post()
  @Roles('ADMIN', 'SUPER_ADMIN')
  create(@Body() body: any, @Request() req: any) {
    return this.svc.create(body, req.user.id);
  }

  @Patch(':id')
  @Roles('ADMIN', 'SUPER_ADMIN')
  update(@Param('id') id: string, @Body() body: any, @Request() req: any) {
    return this.svc.update(id, body, req.user.id);
  }

  @Post(':id/vehicles')
  @Roles('ADMIN', 'SUPER_ADMIN')
  addVehicle(@Param('id') id: string, @Body() body: any, @Request() req: any) {
    return this.svc.addVehicle(id, body, req.user.id);
  }

  @Delete(':id/vehicles/:vehicleId')
  @Roles('ADMIN', 'SUPER_ADMIN')
  removeVehicle(
    @Param('id') id: string,
    @Param('vehicleId') vehicleId: string,
    @Request() req: any,
  ) {
    return this.svc.removeVehicle(id, vehicleId, req.user.id);
  }

  @Post(':id/allocate')
  @Roles('ADMIN', 'SUPER_ADMIN')
  allocateLandedCosts(@Param('id') id: string, @Request() req: any) {
    return this.svc.allocateLandedCosts(id, req.user.id);
  }

  @Patch(':id/vehicles/:vehicleId')
  @Roles('ADMIN', 'SUPER_ADMIN')
  updateShipmentVehicle(
    @Param('id') id: string,
    @Param('vehicleId') vehicleId: string,
    @Body() body: any,
    @Request() req: any,
  ) {
    return this.svc.updateShipmentVehicle(id, vehicleId, body, req.user.id);
  }
}
