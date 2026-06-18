import {
  Controller, Get, Post, Patch, Param, Body, Query, UseGuards, Request,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { InvoicesService } from './invoices.service';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';

@ApiTags('Finance / Invoices')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Controller('finance/invoices')
export class InvoicesController {
  constructor(private svc: InvoicesService) {}

  @Get()
  @Roles('FINANCE', 'ADMIN', 'SUPER_ADMIN', 'MANAGER')
  findAll(@Query() q: any, @Request() req: any) {
    return this.svc.findAll(req.user.companyId, q);
  }

  @Get(':id')
  @Roles('FINANCE', 'ADMIN', 'SUPER_ADMIN', 'MANAGER')
  findById(@Param('id') id: string) {
    return this.svc.findById(id);
  }

  @Post()
  @Roles('FINANCE', 'ADMIN', 'SUPER_ADMIN')
  create(@Body() body: any, @Request() req: any) {
    return this.svc.create(body, req.user.id);
  }

  @Patch(':id/post')
  @Roles('FINANCE', 'ADMIN', 'SUPER_ADMIN')
  post(@Param('id') id: string, @Request() req: any) {
    return this.svc.post(id, req.user.id);
  }

  @Patch(':id/cancel')
  @Roles('FINANCE', 'ADMIN', 'SUPER_ADMIN')
  cancel(@Param('id') id: string, @Request() req: any) {
    return this.svc.cancel(id, req.user.id);
  }

  @Post(':id/lines')
  @Roles('FINANCE', 'ADMIN', 'SUPER_ADMIN')
  addLine(@Param('id') id: string, @Body() body: any, @Request() req: any) {
    return this.svc.addLine(id, body, req.user.id);
  }
}
