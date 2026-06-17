import {
  Controller, Get, Post, Patch, Param, Body, Query, UseGuards, Request,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { DealsService } from './deals.service';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';

@ApiTags('Deals')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Controller('deals')
export class DealsController {
  constructor(private svc: DealsService) {}

  @Get()
  @Roles('SALES_REP', 'MANAGER', 'FINANCE', 'ADMIN', 'SUPER_ADMIN')
  findAll(@Query() q: any, @Request() req: any) {
    const { role, locationId: userLoc } = req.user;
    const locationId = ['ADMIN', 'SUPER_ADMIN'].includes(role) ? q.locationId : (q.locationId ?? userLoc);
    return this.svc.findAll({ ...q, locationId });
  }

  @Get(':id')
  @Roles('SALES_REP', 'MANAGER', 'FINANCE', 'ADMIN', 'SUPER_ADMIN')
  findById(@Param('id') id: string) {
    return this.svc.findById(id);
  }

  @Post()
  @Roles('SALES_REP', 'MANAGER', 'ADMIN', 'SUPER_ADMIN')
  create(@Body() body: any, @Request() req: any) {
    const locationId = body.locationId ?? req.user.locationId;
    return this.svc.create({ ...body, locationId }, req.user.id);
  }

  @Patch(':id')
  @Roles('SALES_REP', 'MANAGER', 'ADMIN', 'SUPER_ADMIN')
  update(@Param('id') id: string, @Body() body: any, @Request() req: any) {
    return this.svc.update(id, body, req.user.id);
  }

  @Post(':id/finalize')
  @Roles('MANAGER', 'FINANCE', 'ADMIN', 'SUPER_ADMIN')
  finalize(@Param('id') id: string, @Request() req: any) {
    return this.svc.finalize(id, req.user.id);
  }

  @Post(':id/cancel')
  @Roles('MANAGER', 'ADMIN', 'SUPER_ADMIN')
  cancel(@Param('id') id: string, @Request() req: any) {
    return this.svc.cancel(id, req.user.id);
  }

  @Post(':id/installment-plan')
  @Roles('MANAGER', 'FINANCE', 'ADMIN', 'SUPER_ADMIN')
  addInstallmentPlan(@Param('id') id: string, @Body() body: any, @Request() req: any) {
    return this.svc.addInstallmentPlan(id, body, req.user.id);
  }
}
