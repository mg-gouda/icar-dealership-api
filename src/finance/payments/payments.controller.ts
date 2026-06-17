import {
  Controller, Get, Post, Patch, Param, Body, Query, UseGuards, Request,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { PaymentsService } from './payments.service';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';

@ApiTags('Finance / Payments')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Controller('finance/payments')
export class PaymentsController {
  constructor(private svc: PaymentsService) {}

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
  postPayment(@Param('id') id: string, @Request() req: any) {
    return this.svc.postPayment(id, req.user.id);
  }

  @Patch(':id/cancel')
  @Roles('FINANCE', 'ADMIN', 'SUPER_ADMIN')
  cancel(@Param('id') id: string, @Request() req: any) {
    return this.svc.cancel(id, req.user.id);
  }
}
