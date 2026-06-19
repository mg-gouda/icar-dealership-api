import { Controller, Get, Post, Patch, Param, Body, Query, UseGuards, Request } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CommissionPlansService } from './commission-plans.service';

@ApiTags('CommissionPlans')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Controller({ path: 'finance/commission-plans', version: '1' })
export class CommissionPlansController {
  constructor(private readonly svc: CommissionPlansService) {}

  @Get()
  @Roles('MANAGER', 'FINANCE', 'ADMIN', 'SUPER_ADMIN')
  list(@Query('active') active?: string) {
    return this.svc.list(active === 'true' ? true : active === 'false' ? false : undefined);
  }

  @Get('resolve')
  @Roles('SALES_REP', 'MANAGER', 'FINANCE', 'ADMIN', 'SUPER_ADMIN')
  resolve(
    @Query('locationId') locationId?: string,
    @Query('vehicleCategory') vehicleCategory?: string,
    @Query('applicableRole') applicableRole?: string,
  ) {
    return this.svc.resolve({ locationId, vehicleCategory, applicableRole });
  }

  @Get(':id')
  @Roles('MANAGER', 'FINANCE', 'ADMIN', 'SUPER_ADMIN')
  findOne(@Param('id') id: string) {
    return this.svc.findOne(id);
  }

  @Post()
  @Roles('ADMIN', 'SUPER_ADMIN')
  create(@Body() body: any) {
    return this.svc.create(body);
  }

  @Patch(':id')
  @Roles('ADMIN', 'SUPER_ADMIN')
  update(@Param('id') id: string, @Body() body: any) {
    return this.svc.update(id, body);
  }
}
