import {
  Controller, Get, Post, Patch, Delete, Param, Body, UseGuards, Request,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { FiscalYearsService } from './fiscal-years.service';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';

@ApiTags('Finance / Fiscal Years')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Controller('finance/fiscal-years')
export class FiscalYearsController {
  constructor(private svc: FiscalYearsService) {}

  @Get()
  @Roles('FINANCE', 'ADMIN', 'SUPER_ADMIN')
  list(@Request() req: any) {
    return this.svc.list(req.user.companyId);
  }

  @Get(':id')
  @Roles('FINANCE', 'ADMIN', 'SUPER_ADMIN')
  getById(@Param('id') id: string, @Request() req: any) {
    return this.svc.getById(id, req.user.companyId);
  }

  @Post()
  @Roles('ADMIN', 'SUPER_ADMIN')
  create(@Body() body: any, @Request() req: any) {
    return this.svc.create({ ...body, companyId: req.user.companyId }, req.user.id);
  }

  @Post(':id/periods/generate')
  @Roles('ADMIN', 'SUPER_ADMIN')
  generatePeriods(@Param('id') id: string, @Body() body: any, @Request() req: any) {
    return this.svc.generatePeriodsForYear(id, req.user.companyId, body, req.user.id);
  }

  @Patch(':id')
  @Roles('ADMIN', 'SUPER_ADMIN')
  update(@Param('id') id: string, @Body() body: any, @Request() req: any) {
    return this.svc.update(id, req.user.companyId, body, req.user.id);
  }

  @Patch(':id/lock')
  @Roles('ADMIN', 'SUPER_ADMIN')
  lock(@Param('id') id: string, @Request() req: any) {
    return this.svc.lock(id, req.user.companyId, req.user.id);
  }

  @Patch(':id/unlock')
  @Roles('ADMIN', 'SUPER_ADMIN')
  unlock(@Param('id') id: string, @Request() req: any) {
    return this.svc.unlock(id, req.user.companyId, req.user.id);
  }

  @Delete(':id')
  @Roles('ADMIN', 'SUPER_ADMIN')
  delete(@Param('id') id: string, @Request() req: any) {
    return this.svc.delete(id, req.user.companyId, req.user.id);
  }
}
