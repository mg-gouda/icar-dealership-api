import {
  Controller, Get, Post, Patch, Delete, Param, Body, Query, UseGuards, Request,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { CurrenciesService } from './currencies.service';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';

@ApiTags('Finance / Currencies')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Controller('finance/currencies')
export class CurrenciesController {
  constructor(private svc: CurrenciesService) {}

  @Get('base')
  @Roles('FINANCE', 'ADMIN', 'SUPER_ADMIN')
  getBaseCurrency(@Request() req: any) {
    return this.svc.getBaseCurrency(req.user.companyId);
  }

  @Get()
  @Roles('FINANCE', 'ADMIN', 'SUPER_ADMIN')
  list(@Query() q: any) {
    return this.svc.list(q);
  }

  @Get(':id')
  @Roles('FINANCE', 'ADMIN', 'SUPER_ADMIN')
  getById(@Param('id') id: string) {
    return this.svc.getById(id);
  }

  @Patch(':id/toggle-active')
  @Roles('ADMIN', 'SUPER_ADMIN')
  toggleActive(@Param('id') id: string, @Body() body: any, @Request() req: any) {
    return this.svc.toggleActive(id, body.active, req.user.id);
  }

  // ── Rates ──

  @Get(':currencyId/rates')
  @Roles('FINANCE', 'ADMIN', 'SUPER_ADMIN')
  listRates(@Param('currencyId') currencyId: string, @Query() q: any) {
    return this.svc.listRates(currencyId, q);
  }

  @Get(':currencyId/rates/at')
  @Roles('FINANCE', 'ADMIN', 'SUPER_ADMIN')
  getRate(@Param('currencyId') currencyId: string, @Query('date') date: string) {
    return this.svc.getRate(currencyId, date);
  }

  @Post(':currencyId/rates')
  @Roles('FINANCE', 'ADMIN', 'SUPER_ADMIN')
  upsertRate(@Param('currencyId') currencyId: string, @Body() body: any, @Request() req: any) {
    return this.svc.upsertRate({ ...body, currencyId }, req.user.id);
  }

  @Post(':currencyId/rates/import')
  @Roles('ADMIN', 'SUPER_ADMIN')
  importRates(@Param('currencyId') currencyId: string, @Body() body: any, @Request() req: any) {
    return this.svc.importRates({ ...body, currencyId }, req.user.id);
  }

  @Delete('rates/:id')
  @Roles('ADMIN', 'SUPER_ADMIN')
  deleteRate(@Param('id') id: string, @Request() req: any) {
    return this.svc.deleteRate(id, req.user.id);
  }

  @Post('revaluate')
  @Roles('FINANCE', 'ADMIN', 'SUPER_ADMIN')
  revaluate(@Request() req: any) {
    return this.svc.revaluate(req.user.companyId, req.user.id);
  }
}
