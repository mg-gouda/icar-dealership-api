import {
  Controller, Get, Post, Patch, Param, Body, Query, UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { AppointmentsService } from './appointments.service';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';

@ApiTags('Appointments')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Controller('appointments')
export class AppointmentsController {
  constructor(private svc: AppointmentsService) {}

  @Get()
  @Roles('SALES_REP', 'MANAGER', 'FINANCE', 'ADMIN', 'SUPER_ADMIN')
  findAll(@Query() q: any) {
    return this.svc.findAll(q);
  }

  @Get(':id')
  @Roles('SALES_REP', 'MANAGER', 'FINANCE', 'ADMIN', 'SUPER_ADMIN')
  findById(@Param('id') id: string) {
    return this.svc.findById(id);
  }

  @Post()
  @Roles('SALES_REP', 'MANAGER', 'ADMIN', 'SUPER_ADMIN')
  create(@Body() body: any) {
    return this.svc.create(body);
  }

  @Patch(':id')
  @Roles('SALES_REP', 'MANAGER', 'ADMIN', 'SUPER_ADMIN')
  update(@Param('id') id: string, @Body() body: any) {
    return this.svc.update(id, body);
  }

  @Patch(':id/complete')
  @Roles('SALES_REP', 'MANAGER', 'ADMIN', 'SUPER_ADMIN')
  complete(@Param('id') id: string) {
    return this.svc.complete(id);
  }

  @Patch(':id/cancel')
  @Roles('MANAGER', 'ADMIN', 'SUPER_ADMIN')
  cancel(@Param('id') id: string) {
    return this.svc.cancel(id);
  }
}
