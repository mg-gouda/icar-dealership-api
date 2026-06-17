import {
  Controller, Get, Post, Patch, Delete, Param, Body, Query, UseGuards, Request,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { TaxesService } from './taxes.service';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';

@ApiTags('Finance / Taxes')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Controller('finance/taxes')
export class TaxesController {
  constructor(private svc: TaxesService) {}

  // ── Taxes ──

  @Get()
  @Roles('FINANCE', 'ADMIN', 'SUPER_ADMIN')
  listTaxes(@Query() q: any) {
    return this.svc.listTaxes(q);
  }

  @Get('groups')
  @Roles('FINANCE', 'ADMIN', 'SUPER_ADMIN')
  listGroups() {
    return this.svc.listGroups();
  }

  @Get(':id')
  @Roles('FINANCE', 'ADMIN', 'SUPER_ADMIN')
  getTaxById(@Param('id') id: string) {
    return this.svc.getTaxById(id);
  }

  @Post()
  @Roles('ADMIN', 'SUPER_ADMIN')
  createTax(@Body() body: any, @Request() req: any) {
    return this.svc.createTax(body, req.user.id);
  }

  @Patch(':id')
  @Roles('ADMIN', 'SUPER_ADMIN')
  updateTax(@Param('id') id: string, @Body() body: any, @Request() req: any) {
    return this.svc.updateTax(id, body, req.user.id);
  }

  @Delete(':id')
  @Roles('ADMIN', 'SUPER_ADMIN')
  deleteTax(@Param('id') id: string, @Request() req: any) {
    return this.svc.deleteTax(id, req.user.id);
  }

  // ── Tax Groups ──

  @Post('groups')
  @Roles('ADMIN', 'SUPER_ADMIN')
  createGroup(@Body() body: any, @Request() req: any) {
    return this.svc.createGroup(body, req.user.id);
  }

  @Patch('groups/:id')
  @Roles('ADMIN', 'SUPER_ADMIN')
  updateGroup(@Param('id') id: string, @Body() body: any, @Request() req: any) {
    return this.svc.updateGroup(id, body, req.user.id);
  }

  @Delete('groups/:id')
  @Roles('ADMIN', 'SUPER_ADMIN')
  deleteGroup(@Param('id') id: string, @Request() req: any) {
    return this.svc.deleteGroup(id, req.user.id);
  }
}
