import { Controller, Get, Post, Patch, Body, Param, UseGuards, Request } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CarMakesService } from './car-makes.service';

@ApiTags('settings / car-makes')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Controller({ path: 'settings/car-makes', version: '1' })
export class CarMakesController {
  constructor(private svc: CarMakesService) {}

  @Get()
  @Roles('SALES_REP', 'MANAGER', 'FINANCE', 'ADMIN', 'SUPER_ADMIN')
  listMakes(@Request() req: any) {
    return this.svc.listMakes(req.user.companyId);
  }

  @Post()
  @Roles('ADMIN', 'SUPER_ADMIN')
  createMake(@Request() req: any, @Body() body: { name: string; slug: string; logoUrl?: string }) {
    return this.svc.createMake(req.user.companyId, body);
  }

  @Patch(':id')
  @Roles('ADMIN', 'SUPER_ADMIN')
  updateMake(@Param('id') id: string, @Request() req: any, @Body() body: { name?: string; logoUrl?: string; isActive?: boolean }) {
    return this.svc.updateMake(id, req.user.companyId, body);
  }

  @Get(':id/models')
  @Roles('SALES_REP', 'MANAGER', 'FINANCE', 'ADMIN', 'SUPER_ADMIN')
  listModels(@Param('id') makeId: string, @Request() req: any) {
    return this.svc.listModels(makeId, req.user.companyId);
  }

  @Post(':id/models')
  @Roles('ADMIN', 'SUPER_ADMIN')
  createModel(@Param('id') makeId: string, @Request() req: any, @Body() body: { name: string }) {
    return this.svc.createModel(makeId, req.user.companyId, body);
  }

  @Patch('models/:modelId')
  @Roles('ADMIN', 'SUPER_ADMIN')
  updateModel(@Param('modelId') modelId: string, @Request() req: any, @Body() body: { name?: string; isActive?: boolean }) {
    return this.svc.updateModel(modelId, req.user.companyId, body);
  }
}
