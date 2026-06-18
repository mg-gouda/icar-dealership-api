import { Controller, Get, Post, Patch, Param, Body, Query, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { RolesGuard } from '../common/guards/roles.guard';
import { LocationScopeGuard } from '../common/guards/location-scope.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { LocationScope } from '../common/decorators/location-scope.decorator';
import { PurchaseOrdersService } from './purchase-orders.service';

@ApiTags('PurchaseOrders')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'), RolesGuard, LocationScopeGuard)
@Controller({ path: 'purchase-orders', version: '1' })
export class PurchaseOrdersController {
  constructor(private readonly svc: PurchaseOrdersService) {}

  @Get()
  @LocationScope()
  @Roles('MANAGER', 'FINANCE', 'ADMIN', 'SUPER_ADMIN')
  list(
    @Query('locationId') locationId?: string,
    @Query('status') status?: string,
    @Query('page') page = '1',
    @Query('limit') limit = '20',
  ) {
    return this.svc.list({ locationId, status, page: Number(page), limit: Number(limit) });
  }

  @Get(':id')
  @Roles('MANAGER', 'FINANCE', 'ADMIN', 'SUPER_ADMIN')
  findOne(@Param('id') id: string) {
    return this.svc.findOne(id);
  }

  @Post()
  @Roles('MANAGER', 'ADMIN', 'SUPER_ADMIN')
  create(@Body() body: any) {
    return this.svc.create(body);
  }

  @Patch(':id/status')
  @Roles('MANAGER', 'ADMIN', 'SUPER_ADMIN')
  updateStatus(@Param('id') id: string, @Body('status') status: string) {
    return this.svc.updateStatus(id, status);
  }

  @Post(':id/receive')
  @Roles('MANAGER', 'ADMIN', 'SUPER_ADMIN')
  receive(
    @Param('id') id: string,
    @Body() body: { lines: { purchaseOrderLineId: string; quantityReceived: number }[] },
  ) {
    return this.svc.receive(id, body.lines);
  }
}
